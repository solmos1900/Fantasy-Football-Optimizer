/**
 * Teammate injury impact — rule-based only.
 *
 * For each player, scan same-NFL-team competitors:
 * - Same position (RB↔RB, QB↔QB)
 * - Target competitors: WR↔WR, WR↔TE, TE↔TE
 *
 * Signals (real ESPN injuryStatus only — never invent):
 * - Opp ↑  when a competitor is OUT / IR / DOUBTFUL (vacated volume)
 * - Opp ↓  when a competitor is ACTIVE after a stored prior OUT/IR/DOUBTFUL
 *          (returning volume)
 *
 * Volume proxy = last-3 avg target share (WR/TE) or carry share (RB)
 * from nflverse; if last-3 has <2 usable weeks (IR / early exit), use
 * season-to-date average. Null share → detail shows "—" (never guess).
 *
 * Trade chip adjustment (transparent):
 *   Δchip ≈ vacatedOrReturningShare × REDIST_FRACTION × SHARE_TO_POINTS
 *   Vacated share is split across healthy same-bucket teammates by their
 *   relative 3-wk opportunity (equal split when shares unknown).
 */

import { prisma } from "@/lib/db";
import { NFLVERSE_LEAGUE_ID } from "@/lib/nflverse/map";
import { formatStatusCode } from "@/lib/utils";
import type {
  FantasyPlayer,
  InjuryStatus,
  PlayerPosition,
} from "@/lib/types";

/** Fraction of vacated/returning share assumed to redistribute in-bucket. */
export const TEAMMATE_INJURY_REDIST_FRACTION = 0.55;

/**
 * Rough full-PPR points per 100% share (calibration for chip nudge only).
 * WR/TE target share 10% ≈ 1.2 pts; RB carry+target opportunity scaled similarly.
 */
export const SHARE_TO_POINTS = 12;

const INJURED: InjuryStatus[] = ["OUT", "IR", "DOUBTFUL"];
const WATCH: InjuryStatus[] = ["OUT", "IR", "DOUBTFUL", "QUESTIONABLE"];

export type TeammateInjuryDirection = "up" | "down";

export type TeammateInjuryImpact = {
  direction: TeammateInjuryDirection;
  /** Short chip e.g. "Opp ↑ WR2 OUT" */
  label: string;
  tone: "good" | "warn" | "bad" | "info";
  teammateName: string;
  teammateEspnId: number;
  teammatePosition: PlayerPosition;
  teammateStatus: InjuryStatus;
  /** Prior status when returning; null for vacated */
  priorStatus: InjuryStatus | null;
  /** 3-wk target share (0–1) or carry-share proxy; null → — */
  share3wk: number | null;
  shareKind: "target" | "carry" | "unknown";
  /** This player's allocated fraction of the vacated/returning share (0–1) */
  allocatedShare: number | null;
  /** Chip-value nudge applied in trade math */
  chipDelta: number;
  detail: string;
};

export type TeammateInjuryIndex = {
  /** espnId → impacts affecting that player */
  byEspnId: Map<number, TeammateInjuryImpact[]>;
  /** espnId → net chip delta */
  chipDeltaByEspnId: Map<number, number>;
  updatedAt: string;
  statsThroughWeek: number;
};

function isInjuredHard(status: InjuryStatus): boolean {
  return INJURED.includes(status);
}

function isWatch(status: InjuryStatus): boolean {
  return WATCH.includes(status);
}

/** Same-team competitors who share volume. */
export function isVolumeCompetitor(
  a: PlayerPosition,
  b: PlayerPosition,
): boolean {
  if (a === b) return true;
  if (
    (a === "WR" || a === "TE") &&
    (b === "WR" || b === "TE")
  ) {
    return true;
  }
  return false;
}

function roleTag(position: PlayerPosition, rankAmong: number): string {
  if (position === "RB") return rankAmong <= 1 ? "RB1" : `RB${rankAmong}`;
  if (position === "WR") return rankAmong <= 1 ? "WR1" : `WR${rankAmong}`;
  if (position === "TE") return rankAmong <= 1 ? "TE1" : `TE${rankAmong}`;
  if (position === "QB") return rankAmong <= 1 ? "QB1" : `QB${rankAmong}`;
  return position;
}

function shortStatus(status: InjuryStatus): string {
  const code = formatStatusCode(status);
  if (code === "QUESTIONABLE") return "Q";
  if (code === "DOUBTFUL") return "D";
  if (code === "OUT") return "OUT";
  if (code === "IR") return "IR";
  if (code === "SUSPENSION") return "SUS";
  return code;
}

function parseInjuryNote(
  note: string | null | undefined,
): { current: InjuryStatus | null; prior: InjuryStatus | null } {
  if (!note) return { current: null, prior: null };
  const cur = note.match(/injuryStatus=([A-Z_/]+)/i);
  const prev = note.match(/prevInjuryStatus=([A-Z_/]+)/i);
  const toStatus = (raw: string | undefined): InjuryStatus | null => {
    if (!raw) return null;
    const u = raw.toUpperCase();
    if (
      u === "ACTIVE" ||
      u === "QUESTIONABLE" ||
      u === "DOUBTFUL" ||
      u === "OUT" ||
      u === "IR" ||
      u === "SUSPENSION"
    ) {
      return u as InjuryStatus;
    }
    return null;
  };
  return { current: toStatus(cur?.[1]), prior: toStatus(prev?.[1]) };
}

/**
 * Persist injury note with previous status when it changes.
 * Call from ESPN public pool refresh paths.
 */
export function mergeInjuryNote(
  existingNote: string | null | undefined,
  nextStatus: InjuryStatus,
): string {
  const parsed = parseInjuryNote(existingNote);
  const prev =
    parsed.current && parsed.current !== nextStatus
      ? parsed.current
      : parsed.prior;
  if (prev && prev !== nextStatus) {
    return `injuryStatus=${nextStatus};prevInjuryStatus=${prev}`;
  }
  return `injuryStatus=${nextStatus}`;
}

type ShareRow = {
  espnId: number;
  week: number;
  targetShare: number | null;
  carries: number | null;
  nflTeam: string | null;
};

async function loadShareRows(options: {
  season: number;
  throughWeek: number;
  espnIds: number[];
}): Promise<Map<number, ShareRow[]>> {
  const out = new Map<number, ShareRow[]>();
  if (!options.espnIds.length || options.throughWeek < 1) return out;
  // Full season through latest completed week — IR players often miss last-3.
  const rows = await prisma.playerWeekStat.findMany({
    where: {
      season: options.season,
      leagueId: NFLVERSE_LEAGUE_ID,
      espnId: { in: options.espnIds },
      week: { gte: 1, lte: options.throughWeek },
    },
    select: {
      espnId: true,
      week: true,
      targetShare: true,
      carries: true,
      nflTeam: true,
    },
  });
  for (const r of rows) {
    const list = out.get(r.espnId) ?? [];
    list.push(r);
    out.set(r.espnId, list);
  }
  return out;
}

/**
 * Vacated/returning volume share from nflverse.
 * Prefer last-3 completed weeks; if that window has fewer than 2 usable
 * observations (typical for IR / early-season exits), fall back to the
 * full season-to-date average so we don't understate pre-injury volume.
 */
function avgShareWindow(
  rows: ShareRow[],
  kind: "target" | "carry",
  throughWeek: number,
  teamCarryTotals?: Map<string, number>,
): number | null {
  const last3from = Math.max(1, throughWeek - 2);
  const last3 = rows.filter((r) => r.week >= last3from && r.week <= throughWeek);
  const season = rows.filter((r) => r.week >= 1 && r.week <= throughWeek);

  const targetVals = (window: ShareRow[]) =>
    window
      .map((r) => r.targetShare)
      .filter((v): v is number => v != null && Number.isFinite(v));

  const carryVals = (window: ShareRow[]) => {
    const parts: number[] = [];
    for (const r of window) {
      if (r.carries == null || !r.nflTeam) continue;
      const teamKey = `${r.nflTeam}|${r.week}`;
      const team = teamCarryTotals?.get(teamKey);
      if (team == null || team <= 0) continue;
      parts.push(r.carries / team);
    }
    return parts;
  };

  if (kind === "target") {
    const recent = targetVals(last3);
    const window = recent.length >= 2 ? recent : targetVals(season);
    if (!window.length) return null;
    return window.reduce((a, b) => a + b, 0) / window.length;
  }

  const recent = carryVals(last3);
  const window = recent.length >= 2 ? recent : carryVals(season);
  if (!window.length) return null;
  return window.reduce((a, b) => a + b, 0) / window.length;
}

async function teamCarryTotals(
  season: number,
  throughWeek: number,
): Promise<Map<string, number>> {
  const grouped = await prisma.playerWeekStat.groupBy({
    by: ["nflTeam", "week"],
    where: {
      season,
      leagueId: NFLVERSE_LEAGUE_ID,
      week: { gte: 1, lte: throughWeek },
      carries: { not: null },
      nflTeam: { not: null },
      position: "RB",
    },
    _sum: { carries: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) {
    if (!g.nflTeam || g._sum.carries == null) continue;
    map.set(`${g.nflTeam}|${g.week}`, g._sum.carries);
  }
  return map;
}

type PoolPlayer = Pick<
  FantasyPlayer,
  "espnId" | "name" | "position" | "nflTeam" | "injuryStatus" | "projectedPoints"
> & {
  /** Optional prior status from DB note */
  priorInjuryStatus?: InjuryStatus | null;
};

/**
 * Build teammate injury impacts for a player pool (league roster + FAs, or NFL pool).
 */
export async function buildTeammateInjuryIndex(options: {
  season: number;
  statsThroughWeek: number;
  players: PoolPlayer[];
}): Promise<TeammateInjuryIndex> {
  const updatedAt = new Date().toISOString();
  const byEspnId = new Map<number, TeammateInjuryImpact[]>();
  const chipDeltaByEspnId = new Map<number, number>();
  const through = Math.max(0, options.statsThroughWeek);

  const players = options.players.filter(
    (p) => p.nflTeam && p.nflTeam !== "FA" && p.position !== "K" && p.position !== "D/ST",
  );
  if (!players.length || through < 1) {
    return { byEspnId, chipDeltaByEspnId, updatedAt, statsThroughWeek: through };
  }

  // Enrich prior status from DB notes when not provided
  const notes = await prisma.playerWeekStat.findMany({
    where: {
      season: options.season,
      leagueId: NFLVERSE_LEAGUE_ID,
      espnId: { in: players.map((p) => p.espnId) },
      gameScriptNote: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    distinct: ["espnId"],
    select: { espnId: true, gameScriptNote: true },
  });
  const priorByEspn = new Map<number, InjuryStatus | null>();
  for (const n of notes) {
    const parsed = parseInjuryNote(n.gameScriptNote);
    priorByEspn.set(n.espnId, parsed.prior);
  }

  const shareMap = await loadShareRows({
    season: options.season,
    throughWeek: through,
    espnIds: players.map((p) => p.espnId),
  });
  const carryTotals = await teamCarryTotals(options.season, through);

  // Rank players on each team by projection for WR2/RB1 labels
  const byTeam = new Map<string, PoolPlayer[]>();
  for (const p of players) {
    const list = byTeam.get(p.nflTeam) ?? [];
    list.push(p);
    byTeam.set(p.nflTeam, list);
  }

  const rankOnTeam = (p: PoolPlayer): number => {
    const mates = (byTeam.get(p.nflTeam) ?? [])
      .filter((m) => m.position === p.position)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    const idx = mates.findIndex((m) => m.espnId === p.espnId);
    return idx >= 0 ? idx + 1 : 1;
  };

  for (const teamPlayers of byTeam.values()) {
    // Candidates who create vacated volume
    const vacated = teamPlayers.filter((p) => isInjuredHard(p.injuryStatus));
    // Returning: currently ACTIVE (or Q) with prior OUT/IR/D
    const returning = teamPlayers.filter((p) => {
      const prior = p.priorInjuryStatus ?? priorByEspn.get(p.espnId) ?? null;
      if (!prior || !isInjuredHard(prior)) return false;
      return p.injuryStatus === "ACTIVE" || p.injuryStatus === "QUESTIONABLE";
    });

    const events: {
      teammate: PoolPlayer;
      direction: TeammateInjuryDirection;
      prior: InjuryStatus | null;
    }[] = [
      ...vacated.map((t) => ({
        teammate: t,
        direction: "up" as const,
        prior: null,
      })),
      ...returning.map((t) => ({
        teammate: t,
        direction: "down" as const,
        prior: t.priorInjuryStatus ?? priorByEspn.get(t.espnId) ?? null,
      })),
    ];

    for (const ev of events) {
      const tm = ev.teammate;
      const shareKind: "target" | "carry" =
        tm.position === "RB" ? "carry" : "target";
      const share3wk = avgShareWindow(
        shareMap.get(tm.espnId) ?? [],
        shareKind,
        through,
        carryTotals,
      );

      // Skip no-name vacates: need real 3-wk share OR meaningful proj.
      // Null share still allowed for OUT/IR stars with proj — detail shows —.
      if (
        share3wk == null &&
        tm.projectedPoints < 6 &&
        ev.direction === "up"
      ) {
        continue;
      }

      // Beneficiaries / losers: healthy volume competitors excluding the teammate
      const bucket = teamPlayers.filter(
        (p) =>
          p.espnId !== tm.espnId &&
          isVolumeCompetitor(p.position, tm.position) &&
          !isInjuredHard(p.injuryStatus) &&
          // Prefer fantasy-relevant teammates (usage or proj)
          (p.projectedPoints >= 4 ||
            (shareMap.get(p.espnId) ?? []).some(
              (r) => (r.targetShare ?? 0) > 0 || (r.carries ?? 0) > 0,
            )),
      );
      if (!bucket.length) continue;

      // Weight by their own 3-wk opportunity when known; else equal split
      const weights = bucket.map((p) => {
        const kind: "target" | "carry" =
          p.position === "RB" ? "carry" : "target";
        const s = avgShareWindow(
          shareMap.get(p.espnId) ?? [],
          kind,
          through,
          carryTotals,
        );
        return { p, w: s != null && s > 0 ? s : null };
      });
      const known = weights.filter((x) => x.w != null) as {
        p: PoolPlayer;
        w: number;
      }[];
      const weightSum = known.reduce((a, x) => a + x.w, 0);

      for (const { p, w } of weights) {
        let allocated: number | null = null;
        if (share3wk == null) {
          allocated = null;
        } else if (weightSum > 0 && w != null) {
          allocated = share3wk * TEAMMATE_INJURY_REDIST_FRACTION * (w / weightSum);
        } else {
          allocated =
            (share3wk * TEAMMATE_INJURY_REDIST_FRACTION) / bucket.length;
        }

        const chipDelta =
          allocated == null
            ? 0
            : Math.round(
                allocated *
                  SHARE_TO_POINTS *
                  (ev.direction === "up" ? 1 : -1) *
                  10,
              ) / 10;

        const role = roleTag(tm.position, rankOnTeam(tm));
        const label =
          ev.direction === "up"
            ? `Opp ↑ ${role} ${shortStatus(tm.injuryStatus)}`
            : `Opp ↓ ${role} back`;

        const shareLabel =
          share3wk == null
            ? "—"
            : shareKind === "target"
              ? `${(share3wk * 100).toFixed(0)}% tgt`
              : `${(share3wk * 100).toFixed(0)}% carry`;
        const allocLabel =
          allocated == null ? "—" : `${(allocated * 100).toFixed(0)}% to you`;

        const detail =
          ev.direction === "up"
            ? `${tm.name} ${shortStatus(tm.injuryStatus)} · ${shareLabel} vacated · your cut ${allocLabel}`
            : `${tm.name} back (${shortStatus(ev.prior ?? "OUT")}→${shortStatus(tm.injuryStatus)}) · ${shareLabel} returns · your cut ${allocLabel}`;

        // Skip QUESTIONABLE vacated unless share is meaningful — still allow OUT/IR/D
        if (
          ev.direction === "up" &&
          tm.injuryStatus === "QUESTIONABLE" &&
          (share3wk == null || share3wk < 0.08)
        ) {
          continue;
        }

        const impact: TeammateInjuryImpact = {
          direction: ev.direction,
          label,
          tone: ev.direction === "up" ? "good" : "warn",
          teammateName: tm.name,
          teammateEspnId: tm.espnId,
          teammatePosition: tm.position,
          teammateStatus: tm.injuryStatus,
          priorStatus: ev.prior,
          share3wk,
          shareKind: share3wk == null ? "unknown" : shareKind,
          allocatedShare: allocated,
          chipDelta,
          detail,
        };

        // Also surface Q as info-only chip without strong chip delta
        if (ev.direction === "up" && tm.injuryStatus === "QUESTIONABLE") {
          impact.tone = "info";
          impact.chipDelta = Math.round(impact.chipDelta * 0.35 * 10) / 10;
          impact.label = `Opp ↑ ${role} Q`;
        }

        const list = byEspnId.get(p.espnId) ?? [];
        list.push(impact);
        byEspnId.set(p.espnId, list);
        chipDeltaByEspnId.set(
          p.espnId,
          Math.round(
            ((chipDeltaByEspnId.get(p.espnId) ?? 0) + impact.chipDelta) * 10,
          ) / 10,
        );
      }
    }
  }

  // Cap to top 2 impacts per player (highest |chipDelta|, then share)
  for (const [id, list] of byEspnId) {
    list.sort(
      (a, b) =>
        Math.abs(b.chipDelta) - Math.abs(a.chipDelta) ||
        (b.share3wk ?? 0) - (a.share3wk ?? 0),
    );
    byEspnId.set(id, list.slice(0, 2));
  }

  return {
    byEspnId,
    chipDeltaByEspnId,
    updatedAt,
    statsThroughWeek: through,
  };
}

export function impactsForPlayer(
  index: TeammateInjuryIndex | null | undefined,
  espnId: number,
): TeammateInjuryImpact[] {
  if (!index) return [];
  return index.byEspnId.get(espnId) ?? [];
}

export function teammateInjuryChipDelta(
  index: TeammateInjuryIndex | null | undefined,
  espnId: number,
): number {
  if (!index) return 0;
  return index.chipDeltaByEspnId.get(espnId) ?? 0;
}

/** Serialize for client components. */
export function serializeTeammateInjuryIndex(
  index: TeammateInjuryIndex,
): {
  updatedAt: string;
  statsThroughWeek: number;
  byEspnId: Record<string, TeammateInjuryImpact[]>;
  chipDeltaByEspnId: Record<string, number>;
} {
  const byEspnId: Record<string, TeammateInjuryImpact[]> = {};
  for (const [k, v] of index.byEspnId) byEspnId[String(k)] = v;
  const chipDeltaByEspnId: Record<string, number> = {};
  for (const [k, v] of index.chipDeltaByEspnId) {
    chipDeltaByEspnId[String(k)] = v;
  }
  return {
    updatedAt: index.updatedAt,
    statsThroughWeek: index.statsThroughWeek,
    byEspnId,
    chipDeltaByEspnId,
  };
}

export function hydrateTeammateInjuryIndex(
  raw:
    | ReturnType<typeof serializeTeammateInjuryIndex>
    | null
    | undefined,
): TeammateInjuryIndex | null {
  if (!raw) return null;
  const byEspnId = new Map<number, TeammateInjuryImpact[]>();
  for (const [k, v] of Object.entries(raw.byEspnId)) {
    byEspnId.set(Number(k), v);
  }
  const chipDeltaByEspnId = new Map<number, number>();
  for (const [k, v] of Object.entries(raw.chipDeltaByEspnId)) {
    chipDeltaByEspnId.set(Number(k), v);
  }
  return {
    byEspnId,
    chipDeltaByEspnId,
    updatedAt: raw.updatedAt,
    statsThroughWeek: raw.statsThroughWeek,
  };
}

// re-export watch helper for callers
export { isWatch };
