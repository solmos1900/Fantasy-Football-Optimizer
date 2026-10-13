/**
 * Defense vs position (DVP) from real nflverse PlayerWeekStat rows.
 *
 * For each defense abbrev + skill position: average full-PPR allowed over the
 * last N completed weeks (player actualPpr where opponent = that defense).
 * Rank 1 = stingiest (fewest points allowed), 32 = softest.
 * Tertiles: 1–10 tough (red), 11–21 average (amber), 22–32 soft (green).
 *
 * Null when we lack enough real samples — never invent ranks.
 */

import { prisma } from "@/lib/db";
import { NFLVERSE_LEAGUE_ID } from "@/lib/nflverse/map";
import { normalizeOpponentAbbrev } from "@/lib/insights/defense-matchups";
import type { PlayerPosition } from "@/lib/types";

export type DvpTier = "tough" | "avg" | "soft";

export type DvpChip = {
  opponent: string;
  position: PlayerPosition;
  /** 1 = toughest … 32 = softest; null when unranked */
  rank: number | null;
  /** Average PPR allowed to this position over the sample window */
  avgAllowed: number | null;
  sampleWeeks: number;
  tier: DvpTier | null;
  /** Short label e.g. "vs DAL 28th" */
  label: string;
};

const SKILL: PlayerPosition[] = ["QB", "RB", "WR", "TE"];

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function tierForRank(rank: number): DvpTier {
  if (rank <= 10) return "tough";
  if (rank <= 21) return "avg";
  return "soft";
}

/**
 * Build DVP ranks for all defenses × skill positions from leagueId="" rows.
 */
export async function buildDefenseVsPositionMap(options: {
  season: number;
  /** Inclusive end of completed weeks window (usually statsThroughWeek). */
  throughWeek: number;
  /** Lookback window in weeks (default 4). */
  lookback?: number;
}): Promise<Map<string, DvpChip>> {
  const lookback = options.lookback ?? 4;
  const through = Math.max(0, options.throughWeek);
  const fromWeek = Math.max(1, through - lookback + 1);
  const out = new Map<string, DvpChip>();

  if (through < 1) return out;

  const rows = await prisma.playerWeekStat.findMany({
    where: {
      season: options.season,
      leagueId: NFLVERSE_LEAGUE_ID,
      week: { gte: fromWeek, lte: through },
      position: { in: SKILL },
      actualPpr: { not: null },
      opponent: { not: null },
    },
    select: {
      position: true,
      opponent: true,
      actualPpr: true,
      week: true,
    },
  });

  // defense|position → list of weekly team totals (sum of player PPR vs that DEF)
  type Bucket = Map<number, number>; // week → total PPR allowed that week
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const def = normalizeOpponentAbbrev(row.opponent ?? undefined);
    if (!def) continue;
    const pos = row.position as PlayerPosition;
    if (!SKILL.includes(pos)) continue;
    const key = `${def}|${pos}`;
    const weekMap = buckets.get(key) ?? new Map<number, number>();
    weekMap.set(
      row.week,
      (weekMap.get(row.week) ?? 0) + (row.actualPpr as number),
    );
    buckets.set(key, weekMap);
  }

  for (const pos of SKILL) {
    const entries: {
      def: string;
      avg: number;
      weeks: number;
    }[] = [];

    for (const [key, weekMap] of buckets) {
      if (!key.endsWith(`|${pos}`)) continue;
      const def = key.split("|")[0]!;
      const vals = [...weekMap.values()];
      if (vals.length < 1) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      entries.push({ def, avg, weeks: vals.length });
    }

    // Need a meaningful field to rank — require at least 8 defenses with data
    if (entries.length < 8) {
      for (const e of entries) {
        out.set(`${e.def}|${pos}`, {
          opponent: e.def,
          position: pos,
          rank: null,
          avgAllowed: Math.round(e.avg * 10) / 10,
          sampleWeeks: e.weeks,
          tier: null,
          label: `vs ${e.def} · —`,
        });
      }
      continue;
    }

    // Rank ascending by avg allowed (lowest = toughest = rank 1)
    entries.sort((a, b) => a.avg - b.avg);
    entries.forEach((e, idx) => {
      const rank = idx + 1;
      const tier = tierForRank(rank);
      out.set(`${e.def}|${pos}`, {
        opponent: e.def,
        position: pos,
        rank,
        avgAllowed: Math.round(e.avg * 10) / 10,
        sampleWeeks: e.weeks,
        tier,
        label: `vs ${e.def} ${ordinal(rank)}`,
      });
    });
  }

  return out;
}

export function dvpForPlayer(
  map: Map<string, DvpChip>,
  opponent: string | undefined,
  position: PlayerPosition,
): DvpChip | null {
  const def = normalizeOpponentAbbrev(opponent);
  if (!def) return null;
  if (!SKILL.includes(position)) return null;
  return map.get(`${def}|${position}`) ?? null;
}
