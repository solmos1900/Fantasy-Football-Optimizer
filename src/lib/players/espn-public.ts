/**
 * League-agnostic ESPN fantasy player pool (projections + injuries + ownership).
 * Uses the season `/players?view=kona_player_info` endpoint — no league cookies.
 *
 * Product rule (guest / no-league pool): nflverse is the ONLY source of actual
 * fantasy points. ESPN public data supplies injury status, ownership, and
 * current-week projected category totals for persistence — never recentWeeks
 * or completed-week actuals (mixed 2025/2026 season blocks caused #125).
 */

import { EspnApiError } from "@/lib/espn/client";
import { nflTeamFromEspn } from "@/lib/espn/pro-teams";
import { fullPprFromEspnStatMap } from "@/lib/players/scoring";
import type {
  FantasyPlayer,
  InjuryStatus,
  PlayerPosition,
} from "@/lib/types";
import { defaultEspnSeason } from "@/lib/season";

const ESPN_PLAYERS_BASE =
  "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

const POS_MAP: Record<number, PlayerPosition> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

function injuryFromPlayer(player: Record<string, unknown>): InjuryStatus {
  const injury = player.injuryStatus as string | undefined;
  if (!injury) return "ACTIVE";
  const upper = injury.toUpperCase();
  if (upper.includes("QUESTIONABLE")) return "QUESTIONABLE";
  if (upper.includes("DOUBTFUL")) return "DOUBTFUL";
  if (upper.includes("OUT")) return "OUT";
  if (upper.includes("INJURY") || upper === "IR") return "IR";
  if (upper === "PUP" || upper.includes("PHYSICALLY UNABLE")) return "PUP";
  if (upper.includes("SUSPENSION")) return "SUSPENSION";
  return "ACTIVE";
}

type EspnPlayerRow = {
  id?: number;
  fullName?: string;
  defaultPositionId?: number;
  proTeamId?: number;
  injuryStatus?: string;
  ownership?: { percentOwned?: number; percentStarted?: number };
  stats?: Array<{
    scoringPeriodId?: number;
    seasonId?: number;
    statSourceId?: number;
    statSplitTypeId?: number;
    appliedTotal?: number | null;
    stats?: Record<string, number>;
  }>;
};

function pprForStatBlock(
  block:
    | {
        appliedTotal?: number | null;
        stats?: Record<string, number>;
      }
    | undefined,
): number | null {
  if (!block) return null;
  // Prefer category formula (true full PPR). ESPN appliedTotal follows
  // league-default scoring and has been observed to drop TDs / under-count QBs.
  const fromCats = fullPprFromEspnStatMap(block.stats);
  if (fromCats != null) return fromCats;
  if (typeof block.appliedTotal === "number" && Number.isFinite(block.appliedTotal)) {
    return Math.round(block.appliedTotal * 10) / 10;
  }
  return null;
}

export function mapEspnPublicPlayer(
  row: EspnPlayerRow,
  scoringPeriodId: number,
): FantasyPlayer | null {
  const espnId = Number(row.id ?? 0);
  if (!espnId) return null;
  const position = POS_MAP[Number(row.defaultPositionId ?? 0)];
  if (!position || position === "K" || position === "D/ST") return null;

  const stats = row.stats ?? [];
  const projectedBlock = stats.find(
    (s) =>
      s.scoringPeriodId === scoringPeriodId &&
      s.statSourceId === 1 &&
      s.statSplitTypeId === 1,
  );

  const ownership = row.ownership ?? {};

  return {
    id: `espn-${espnId}`,
    espnId,
    name: String(row.fullName ?? "Unknown"),
    position,
    nflTeam: nflTeamFromEspn(Number(row.proTeamId ?? 0)),
    injuryStatus: injuryFromPlayer(row as Record<string, unknown>),
    // Current-week projection only — used for short-TTL persist; display uses Sleeper.
    projectedPoints: pprForStatBlock(projectedBlock),
    // Never emit ESPN actuals — nflverse owns completed-week points (#125).
    actualPoints: null,
    percentOwned: Number(ownership.percentOwned ?? 0),
    percentStarted: Number(ownership.percentStarted ?? 0),
    // Never emit ESPN recentWeeks — seasonId-unaware stats mixed 2025 into 2026.
    recentWeeks: [],
  };
}

/**
 * Overlay live ESPN public injury + ownership onto a DB-backed pool.
 * Never replaces recentWeeks or actualPoints (nflverse / DB wins).
 */
export function overlayEspnInjuryOwnership(
  existing: FantasyPlayer[],
  fresh: FantasyPlayer[],
): FantasyPlayer[] {
  const byId = new Map(existing.map((p) => [p.espnId, p]));
  for (const p of fresh) {
    const prev = byId.get(p.espnId);
    if (!prev) {
      byId.set(p.espnId, {
        ...p,
        actualPoints: null,
        recentWeeks: [],
        // Projections come from Sleeper overlay later.
        projectedPoints: 0,
      });
      continue;
    }
    byId.set(p.espnId, {
      ...prev,
      injuryStatus: p.injuryStatus,
      percentOwned: p.percentOwned,
      percentStarted: p.percentStarted,
      name: p.name || prev.name,
    });
  }
  return [...byId.values()];
}

/**
 * Fetch the public ESPN fantasy player universe for a scoring period.
 * No league cookies. Caps to top owned skill players for usable search.
 */
export async function fetchEspnPublicSkillPlayers(options: {
  season?: number;
  scoringPeriodId: number;
  limit?: number;
}): Promise<FantasyPlayer[]> {
  const season = options.season ?? defaultEspnSeason();
  const limit = options.limit ?? 400;
  const url = new URL(`${ESPN_PLAYERS_BASE}/${season}/players`);
  url.searchParams.set("scoringPeriodId", String(options.scoringPeriodId));
  url.searchParams.set("view", "kona_player_info");

  const filter = {
    players: {
      filterSlotIds: { value: [0, 2, 4, 6] },
      limit,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
    },
  };

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "x-fantasy-filter": JSON.stringify(filter),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EspnApiError(
      `ESPN public players error ${res.status}: ${body.slice(0, 160)}`,
      res.status,
    );
  }

  const raw = (await res.json()) as EspnPlayerRow[] | { players?: EspnPlayerRow[] };
  const rows = Array.isArray(raw) ? raw : (raw.players ?? []);

  const out: FantasyPlayer[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const mapped = mapEspnPublicPlayer(row, options.scoringPeriodId);
    if (!mapped || seen.has(mapped.espnId)) continue;
    seen.add(mapped.espnId);
    out.push(mapped);
    if (out.length >= limit) break;
  }

  // ESPN sometimes ignores limit — keep the highest owned.
  return out
    .sort((a, b) => b.percentOwned - a.percentOwned)
    .slice(0, limit);
}
