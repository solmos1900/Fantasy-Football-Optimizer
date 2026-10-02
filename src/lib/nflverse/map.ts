/**
 * Map nflverse weekly player-stat rows → PlayerWeekStat usage columns.
 * Only real fields — never invent shares, RZ, or fantasy points.
 */

import { parseOptionalFloat } from "./csv";

/** League-agnostic usage rows use empty leagueId (ESPN sync keeps league-scoped PPR). */
export const NFLVERSE_LEAGUE_ID = "";

export const NFLVERSE_SOURCE = "nflverse";

export type NflverseUsageMapped = {
  gsisId: string;
  playerName: string;
  position: string;
  nflTeam: string | null;
  season: number;
  week: number;
  opponent: string | null;
  targets: number | null;
  receptions: number | null;
  carries: number | null;
  rushingAttempts: number | null;
  rushingYards: number | null;
  receivingYards: number | null;
  targetShare: number | null;
  airYards: number | null;
  /** Filled later from snap_counts when join succeeds; otherwise null. */
  snapShare: number | null;
};

const SKILL_POSITIONS = new Set(["QB", "RB", "WR", "TE", "FB"]);

function cell(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * Map one nflverse `stats_player_week_*.csv` row.
 * Returns null when the row is not REG skill usage we can store.
 */
export function mapNflverseWeekRow(
  row: Record<string, string>,
  opts?: { week?: number },
): NflverseUsageMapped | null {
  const seasonType = cell(row, "season_type").toUpperCase();
  if (seasonType && seasonType !== "REG") return null;

  const week = parseOptionalFloat(cell(row, "week"));
  if (week == null || week < 1 || week > 22) return null;
  if (opts?.week != null && week !== opts.week) return null;

  const season = parseOptionalFloat(cell(row, "season"));
  if (season == null) return null;

  const gsisId = cell(row, "player_id", "gsis_id");
  if (!gsisId) return null;

  const position = cell(row, "position").toUpperCase();
  if (position && !SKILL_POSITIONS.has(position)) return null;

  const playerName =
    cell(row, "player_display_name", "player_name", "player") || gsisId;
  const nflTeam = cell(row, "team", "recent_team") || null;
  const opponent = cell(row, "opponent_team", "opponent") || null;

  const targets = parseOptionalFloat(cell(row, "targets"));
  const receptions = parseOptionalFloat(cell(row, "receptions"));
  const carries = parseOptionalFloat(cell(row, "carries"));
  const rushingYards = parseOptionalFloat(cell(row, "rushing_yards"));
  const receivingYards = parseOptionalFloat(cell(row, "receiving_yards"));
  const targetShare = parseOptionalFloat(cell(row, "target_share"));
  const airYards = parseOptionalFloat(cell(row, "receiving_air_yards"));

  // Skip empty shells (no usage signal at all)
  const hasUsage =
    (targets != null && targets > 0) ||
    (receptions != null && receptions > 0) ||
    (carries != null && carries > 0) ||
    (rushingYards != null && rushingYards !== 0) ||
    (receivingYards != null && receivingYards !== 0) ||
    (targetShare != null && targetShare > 0) ||
    (airYards != null && airYards !== 0);

  if (!hasUsage && position !== "QB") {
    // Keep QBs with zero rush/recv if they appear (still a REG participation row)
    // but drop pure zero skill rows to avoid noise.
    const attempts = parseOptionalFloat(cell(row, "attempts", "completions"));
    if (attempts == null || attempts <= 0) return null;
  }

  return {
    gsisId,
    playerName,
    position: position || "UNK",
    nflTeam,
    season: Math.trunc(season),
    week: Math.trunc(week),
    opponent,
    targets,
    receptions,
    carries,
    rushingAttempts: carries, // nflverse uses `carries` for rush attempts
    rushingYards,
    receivingYards,
    targetShare,
    airYards,
    snapShare: null,
  };
}

/** Snap % from nflverse snap_counts (0–1). Empty → null. */
export function mapSnapPct(raw: string | undefined): number | null {
  return parseOptionalFloat(raw);
}

/**
 * Build usage partial for Prisma upsert.
 * Does NOT include projectedPpr / actualPpr — ESPN sync owns those.
 */
export function usageFieldsForWrite(mapped: NflverseUsageMapped) {
  return {
    targets: mapped.targets,
    receptions: mapped.receptions,
    carries: mapped.carries,
    rushingAttempts: mapped.rushingAttempts,
    rushingYards: mapped.rushingYards,
    receivingYards: mapped.receivingYards,
    targetShare: mapped.targetShare,
    airYards: mapped.airYards,
    snapShare: mapped.snapShare,
    // Explicitly leave advanced cols null unless nflverse provides them
    rushShare: null as number | null,
    routePct: null as number | null,
    redZoneTargets: null as number | null,
    redZoneTouches: null as number | null,
    goalLineCarries: null as number | null,
  };
}

/**
 * Merge nflverse usage into an existing row: only fill columns that are currently null.
 * Never touches projectedPpr / actualPpr / projectionDelta.
 */
export function mergeNullUsageOnly(
  existing: {
    targets: number | null;
    receptions: number | null;
    carries: number | null;
    rushingAttempts: number | null;
    rushingYards: number | null;
    receivingYards: number | null;
    targetShare: number | null;
    airYards: number | null;
    snapShare: number | null;
    opponent: string | null;
  },
  mapped: NflverseUsageMapped,
): Record<string, string | number | null> {
  const next: Record<string, string | number | null> = {};
  const pairs: [keyof typeof existing, number | null | string][] = [
    ["targets", mapped.targets],
    ["receptions", mapped.receptions],
    ["carries", mapped.carries],
    ["rushingAttempts", mapped.rushingAttempts],
    ["rushingYards", mapped.rushingYards],
    ["receivingYards", mapped.receivingYards],
    ["targetShare", mapped.targetShare],
    ["airYards", mapped.airYards],
    ["snapShare", mapped.snapShare],
    ["opponent", mapped.opponent],
  ];
  for (const [key, value] of pairs) {
    if (existing[key] == null && value != null) {
      next[key] = value as number | string;
    }
  }
  return next;
}
