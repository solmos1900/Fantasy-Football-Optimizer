/**
 * Sleeper public projections (current-week only for Insights).
 *
 * Working endpoint (array + nested stats.pts_ppr):
 *   GET https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular
 *
 * Note: `/v1/projections/...` returns empty shells `{}` — do not use it.
 *
 * Crosswalk priority:
 * 1. Sleeper `espn_id` → ESPN id
 * 2. Fallback: normalized `full_name|TEAM` (many rookies have null espn_id)
 *
 * Bye / missing pts_ppr → omit (UI shows —). Never invent or relabel ESPN as Sleeper.
 */

import { defaultEspnSeason } from "@/lib/season";
import { secureFetch } from "@/lib/http/secure-fetch";

export type SleeperProjectionMap = {
  /** espnId → full-PPR projection for the requested week */
  byEspnId: Map<number, number>;
  /** "full name|TEAM" → pts (fallback when espn_id missing on Sleeper) */
  byNameTeam: Map<string, number>;
  season: number;
  week: number;
  fetchedAt: string;
  /** True when the endpoint responded but had zero numeric projections. */
  emptyFeed: boolean;
};

type SleeperPlayer = {
  player_id?: string;
  espn_id?: string | number | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  team?: string | null;
};

type SleeperProjRow = {
  player_id?: string;
  opponent?: string | null;
  team?: string | null;
  week?: number;
  stats?: Record<string, number | string | null | undefined>;
  pts_ppr?: number | string | null;
  pts_half_ppr?: number | string | null;
  pts?: number | string | null;
  player?: SleeperPlayer;
};

const PLAYERS_TTL_MS = 6 * 60 * 60 * 1000;
let playersCache:
  | {
      at: number;
      espnToSleeper: Map<number, string>;
      sleeperMeta: Map<
        string,
        { espnId: number | null; nameTeam: string | null }
      >;
    }
  | null = null;

export function sleeperNameTeamKey(
  name: string,
  team?: string | null,
): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  const t = (team ?? "").trim().toUpperCase();
  return t ? `${n}|${t}` : n;
}

async function loadSleeperPlayers(): Promise<{
  espnToSleeper: Map<number, string>;
  sleeperMeta: Map<string, { espnId: number | null; nameTeam: string | null }>;
}> {
  if (playersCache && Date.now() - playersCache.at < PLAYERS_TTL_MS) {
    return {
      espnToSleeper: playersCache.espnToSleeper,
      sleeperMeta: playersCache.sleeperMeta,
    };
  }
  const res = await secureFetch("https://api.sleeper.app/v1/players/nfl", {
    timeoutMs: 45_000,
    retries: 2,
    next: { revalidate: 21600 },
  });
  if (!res.ok) {
    throw new Error(`Sleeper players HTTP ${res.status}`);
  }
  const rawUnknown: unknown = await res.json();
  // Loose parse — Sleeper directory is huge; reject non-objects only.
  if (!rawUnknown || typeof rawUnknown !== "object") {
    throw new Error("Sleeper players: invalid JSON shape");
  }
  const raw = rawUnknown as Record<string, SleeperPlayer>;
  const espnToSleeper = new Map<number, string>();
  const sleeperMeta = new Map<
    string,
    { espnId: number | null; nameTeam: string | null }
  >();
  for (const [sid, p] of Object.entries(raw)) {
    if (!p) continue;
    const espnRaw = Number(p.espn_id);
    const espnId =
      Number.isFinite(espnRaw) && espnRaw > 0 ? espnRaw : null;
    if (espnId != null && !espnToSleeper.has(espnId)) {
      espnToSleeper.set(espnId, sid);
    }
    const full =
      p.full_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ");
    const nameTeam = full
      ? sleeperNameTeamKey(full, p.team)
      : null;
    sleeperMeta.set(sid, { espnId, nameTeam });
  }
  playersCache = { at: Date.now(), espnToSleeper, sleeperMeta };
  return { espnToSleeper, sleeperMeta };
}

function ptsPprFromRow(row: SleeperProjRow | null | undefined): number | null {
  if (!row || typeof row !== "object") return null;
  const pts =
    row.stats?.pts_ppr ??
    row.stats?.pts_half_ppr ??
    row.stats?.pts ??
    row.pts_ppr ??
    row.pts_half_ppr ??
    row.pts;
  if (typeof pts === "number" && Number.isFinite(pts)) {
    return Math.round(pts * 10) / 10;
  }
  if (typeof pts === "string" && pts.trim() !== "") {
    const n = Number(pts);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }
  return null;
}

/**
 * Fetch current-week Sleeper full-PPR projections keyed by ESPN id + name|team.
 * Empty feed → maps empty + emptyFeed true (UI shows —).
 */
export async function fetchSleeperProjections(options?: {
  season?: number;
  week?: number;
}): Promise<SleeperProjectionMap> {
  const season = options?.season ?? defaultEspnSeason();
  const week = options?.week ?? 1;
  const fetchedAt = new Date().toISOString();
  const byEspnId = new Map<number, number>();
  const byNameTeam = new Map<string, number>();

  try {
    const [{ espnToSleeper, sleeperMeta }, projRes] = await Promise.all([
      loadSleeperPlayers(),
      secureFetch(
        `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`,
        { timeoutMs: 30_000, retries: 2, next: { revalidate: 600 } },
      ),
    ]);

    if (!projRes.ok) {
      return {
        byEspnId,
        byNameTeam,
        season,
        week,
        fetchedAt,
        emptyFeed: true,
      };
    }

    const rawParsed: unknown = await projRes.json();
    if (
      rawParsed == null ||
      (typeof rawParsed !== "object" && !Array.isArray(rawParsed))
    ) {
      return {
        byEspnId,
        byNameTeam,
        season,
        week,
        fetchedAt,
        emptyFeed: true,
      };
    }
    const raw = rawParsed as SleeperProjRow[] | Record<string, SleeperProjRow>;

    const sleeperToEspn = new Map<string, number>();
    for (const [espn, sid] of espnToSleeper) {
      if (!sleeperToEspn.has(sid)) sleeperToEspn.set(sid, espn);
    }

    const rows: SleeperProjRow[] = Array.isArray(raw)
      ? raw
      : Object.entries(raw).map(([key, row]) => ({
          ...row,
          player_id: row?.player_id ?? key,
        }));

    let nonempty = 0;
    for (const row of rows) {
      const pts = ptsPprFromRow(row);
      if (pts == null) continue;
      const sid = String(row.player_id ?? row.player?.player_id ?? "");
      if (!sid) continue;

      const meta = sleeperMeta.get(sid);
      const espn =
        sleeperToEspn.get(sid) ??
        meta?.espnId ??
        null;
      if (espn != null) {
        byEspnId.set(espn, pts);
      }

      const full =
        row.player?.full_name ||
        [row.player?.first_name, row.player?.last_name]
          .filter(Boolean)
          .join(" ");
      const team = row.team ?? row.player?.team ?? null;
      const nameTeam =
        meta?.nameTeam ||
        (full ? sleeperNameTeamKey(full, team) : null);
      if (nameTeam) {
        byNameTeam.set(nameTeam, pts);
      }
      nonempty += 1;
    }

    return {
      byEspnId,
      byNameTeam,
      season,
      week,
      fetchedAt,
      emptyFeed: nonempty === 0,
    };
  } catch {
    return {
      byEspnId,
      byNameTeam,
      season,
      week,
      fetchedAt,
      emptyFeed: true,
    };
  }
}

/** Resolve a player's Sleeper full-PPR proj via espn id, then name|team. */
export function sleeperProjForPlayer(
  map: SleeperProjectionMap | null | undefined,
  player: { espnId: number; name: string; nflTeam: string },
): number | null {
  if (!map) return null;
  const byId = map.byEspnId.get(player.espnId);
  if (byId != null) return byId;
  return map.byNameTeam.get(
    sleeperNameTeamKey(player.name, player.nflTeam),
  ) ?? null;
}
