/**
 * Map nflverse weekly player stats (+ optional snaps) → PlayerWeekStat usage fields.
 *
 * Only real nflverse columns. Null beats fake. RZ / routePct left null in v1
 * unless the weekly file exposes them (it does not today).
 */

import { numOrNull, strOrNull, type CsvRow } from "./csv";

/** League-agnostic usage rows use empty leagueId (unique key companion). */
export const NFLVERSE_LEAGUE_ID = "";

export const NFLVERSE_SOURCE = "nflverse";

/** Skill + QB positions we persist usage for. */
export const USAGE_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

export type MappedUsage = {
  gsisId: string;
  season: number;
  week: number;
  playerName: string;
  position: string;
  nflTeam: string | null;
  opponent: string | null;
  targets: number | null;
  receptions: number | null;
  carries: number | null;
  rushingAttempts: number | null;
  rushingYards: number | null;
  receivingYards: number | null;
  airYards: number | null;
  targetShare: number | null;
  rushShare: number | null;
  snapShare: number | null;
  /** Always null in v1 — weekly file has no RZ columns. */
  redZoneTargets: null;
  redZoneTouches: null;
  goalLineCarries: null;
  routePct: null;
};

function firstNum(row: CsvRow, keys: string[]): number | null {
  for (const key of keys) {
    if (key in row) {
      const n = numOrNull(row[key]);
      if (n != null) return n;
    }
  }
  return null;
}

function firstStr(row: CsvRow, keys: string[]): string | null {
  for (const key of keys) {
    if (key in row) {
      const s = strOrNull(row[key]);
      if (s) return s;
    }
  }
  return null;
}

/**
 * Compute team rush totals for rushShare = carries / team_carries.
 * Keys: `${team}|${week}|${season_type}`
 */
export function teamCarryTotals(rows: CsvRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const team = firstStr(row, ["team"]);
    const week = firstStr(row, ["week"]);
    const seasonType = firstStr(row, ["season_type", "game_type"]) ?? "REG";
    if (!team || !week) continue;
    const carries = firstNum(row, ["carries", "rushing_attempts"]) ?? 0;
    const key = `${team}|${week}|${seasonType}`;
    totals.set(key, (totals.get(key) ?? 0) + carries);
  }
  return totals;
}

export type SnapShareIndex = Map<string, number>; // `${pfrId}|${week}` → offense_pct 0..1

export function buildSnapShareIndex(
  snapRows: CsvRow[],
  week: number,
): SnapShareIndex {
  const out: SnapShareIndex = new Map();
  for (const row of snapRows) {
    const w = numOrNull(row.week);
    if (w !== week) continue;
    const gameType = strOrNull(row.game_type) ?? "REG";
    if (gameType !== "REG" && gameType !== "regular") continue;
    const pfrId = strOrNull(row.pfr_player_id);
    const pct = numOrNull(row.offense_pct);
    if (!pfrId || pct == null) continue;
    // offense_pct is already 0..1 in nflverse snap_counts
    out.set(`${pfrId}|${week}`, pct);
  }
  return out;
}

export function mapWeekStatRow(
  row: CsvRow,
  opts: {
    teamCarries: Map<string, number>;
    snapByPfrWeek?: SnapShareIndex;
    pfrIdByGsis?: Map<string, string | null>;
  },
): MappedUsage | null {
  const gsisId = firstStr(row, ["player_id", "gsis_id"]);
  const season = firstNum(row, ["season"]);
  const week = firstNum(row, ["week"]);
  if (!gsisId || season == null || week == null) return null;

  const seasonType = firstStr(row, ["season_type", "game_type"]) ?? "REG";
  if (seasonType !== "REG") return null;

  const position = (firstStr(row, ["position"]) ?? "").toUpperCase();
  if (!USAGE_POSITIONS.has(position)) return null;

  const playerName =
    firstStr(row, ["player_display_name", "player_name", "player"]) ?? gsisId;
  const nflTeam = firstStr(row, ["team"]);
  const opponent = firstStr(row, ["opponent_team", "opponent"]);

  const carries = firstNum(row, ["carries", "rushing_attempts"]);
  const targets = firstNum(row, ["targets"]);
  const receptions = firstNum(row, ["receptions"]);
  const rushingYards = firstNum(row, ["rushing_yards"]);
  const receivingYards = firstNum(row, ["receiving_yards"]);
  // Skill air yards only — do not use passing_air_yards for WR/RB usage UI
  const airYards = firstNum(row, ["receiving_air_yards"]);
  const targetShare = firstNum(row, ["target_share", "tgt_sh"]);

  let rushShare: number | null = null;
  if (carries != null && nflTeam) {
    const teamTotal = opts.teamCarries.get(`${nflTeam}|${week}|${seasonType}`);
    if (teamTotal != null && teamTotal > 0) {
      rushShare = carries / teamTotal;
    }
  }

  let snapShare: number | null = null;
  if (opts.snapByPfrWeek && opts.pfrIdByGsis) {
    const pfrId = opts.pfrIdByGsis.get(gsisId);
    if (pfrId) {
      snapShare = opts.snapByPfrWeek.get(`${pfrId}|${week}`) ?? null;
    }
  }

  return {
    gsisId,
    season,
    week,
    playerName,
    position,
    nflTeam,
    opponent,
    targets,
    receptions,
    carries,
    rushingAttempts: carries,
    rushingYards,
    receivingYards,
    airYards,
    targetShare,
    rushShare,
    snapShare,
    redZoneTargets: null,
    redZoneTouches: null,
    goalLineCarries: null,
    routePct: null,
  };
}

/** Filter season CSV down to one REG week, then map. */
export function mapWeekStats(
  rows: CsvRow[],
  week: number,
  opts: {
    snapRows?: CsvRow[];
    pfrIdByGsis?: Map<string, string | null>;
  } = {},
): MappedUsage[] {
  const weekRows = rows.filter((row) => {
    const w = firstNum(row, ["week"]);
    const st = firstStr(row, ["season_type", "game_type"]) ?? "REG";
    return w === week && st === "REG";
  });
  const teamCarries = teamCarryTotals(weekRows);
  const snapByPfrWeek = opts.snapRows
    ? buildSnapShareIndex(opts.snapRows, week)
    : undefined;

  const out: MappedUsage[] = [];
  for (const row of weekRows) {
    const mapped = mapWeekStatRow(row, {
      teamCarries,
      snapByPfrWeek,
      pfrIdByGsis: opts.pfrIdByGsis,
    });
    if (mapped) out.push(mapped);
  }
  return out;
}
