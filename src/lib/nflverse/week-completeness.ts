/**
 * Assess whether a finished NFL week looks complete in PlayerWeekStat
 * (leagueId="" / nflverse): every scoreboard game team should have stat rows,
 * including Monday night.
 */

import { prisma } from "@/lib/db";
import { fetchEspnScoreboard } from "@/lib/espn/client";
import { parseEspnScoreboard } from "@/lib/espn/scoreboard";
import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";
import { NFLVERSE_LEAGUE_ID } from "@/lib/nflverse/map";
import { fetchNflWeekSnapshot } from "@/lib/players/week";

export type WeekCompletenessResult = {
  season: number;
  week: number;
  /** null when scoreboard had no events (cannot assess). */
  weekComplete: boolean | null;
  allGamesFinal: boolean | null;
  scoreboardGames: number;
  expectedGameTeams: string[];
  teamsWithStats: string[];
  missingTeams: string[];
  /** Rows with any real usage/PPR signal for this week (null beats fake). */
  statRowCount: number;
  /** Max week present in leagueId="" PlayerWeekStat for the season. */
  latestWeekInDb: number | null;
  latestWeekUpdatedAt: string | null;
  /** ESPN latest fully finished REG week. */
  latestCompletedWeekEspn: number | null;
  /** True when ESPN completed week is ahead of DB latest week. */
  stale: boolean;
};

async function latestWeekCoverage(season: number): Promise<{
  latestWeek: number | null;
  updatedAt: Date | null;
}> {
  const agg = await prisma.playerWeekStat.aggregate({
    where: { season, leagueId: NFLVERSE_LEAGUE_ID },
    _max: { week: true, updatedAt: true },
  });
  return {
    latestWeek: agg._max.week ?? null,
    updatedAt: agg._max.updatedAt ?? null,
  };
}

/**
 * Teams that played in `week` (from ESPN public scoreboard) vs teams that
 * have at least one nflverse week-stat row with real PPR or usage.
 */
export async function assessWeekCompleteness(options: {
  season: number;
  week: number;
}): Promise<WeekCompletenessResult> {
  const { season, week } = options;

  let expectedGameTeams: string[] = [];
  let scoreboardGames = 0;
  let allGamesFinal: boolean | null = null;

  try {
    const board = await fetchEspnScoreboard(week, season);
    const parsed = parseEspnScoreboard(
      board as Parameters<typeof parseEspnScoreboard>[0],
    );
    scoreboardGames = parsed.games.length;
    allGamesFinal =
      parsed.games.length > 0 &&
      parsed.games.every((g) => g.status === "final");
    const teams = new Set<string>();
    for (const g of parsed.games) {
      const home = normalizeNflAbbrev(g.home);
      const away = normalizeNflAbbrev(g.away);
      if (home && home !== "FA" && home !== "HOME") teams.add(home);
      if (away && away !== "FA" && away !== "AWAY") teams.add(away);
    }
    expectedGameTeams = [...teams].sort();
  } catch {
    // Scoreboard unavailable — leave completeness unknown.
  }

  const rows = await prisma.playerWeekStat.findMany({
    where: {
      season,
      week,
      leagueId: NFLVERSE_LEAGUE_ID,
      OR: [
        { actualPpr: { not: null } },
        { targets: { not: null } },
        { carries: { not: null } },
        { receptions: { not: null } },
      ],
    },
    select: { nflTeam: true },
  });
  const teamsWithStatsSet = new Set<string>();
  for (const r of rows) {
    const t = normalizeNflAbbrev(r.nflTeam);
    if (t && t !== "FA") teamsWithStatsSet.add(t);
  }
  const teamsWithStats = [...teamsWithStatsSet].sort();
  const missingTeams =
    expectedGameTeams.length > 0
      ? expectedGameTeams.filter((t) => !teamsWithStatsSet.has(t))
      : [];

  let weekComplete: boolean | null = null;
  if (expectedGameTeams.length > 0) {
    weekComplete = missingTeams.length === 0 && rows.length > 0;
  }

  const coverage = await latestWeekCoverage(season);
  let latestCompletedWeekEspn: number | null = null;
  try {
    const snap = await fetchNflWeekSnapshot(season);
    latestCompletedWeekEspn = snap.latestCompletedWeek;
  } catch {
    latestCompletedWeekEspn = null;
  }

  const stale =
    latestCompletedWeekEspn != null &&
    latestCompletedWeekEspn > 0 &&
    (coverage.latestWeek == null || coverage.latestWeek < latestCompletedWeekEspn);

  return {
    season,
    week,
    weekComplete,
    allGamesFinal,
    scoreboardGames,
    expectedGameTeams,
    teamsWithStats,
    missingTeams,
    statRowCount: rows.length,
    latestWeekInDb: coverage.latestWeek,
    latestWeekUpdatedAt: coverage.updatedAt?.toISOString() ?? null,
    latestCompletedWeekEspn,
    stale,
  };
}

/** Lightweight DB-only summary for the health route (no scoreboard call). */
export async function loadLatestWeekInDb(season: number): Promise<{
  latestWeek: number | null;
  updatedAt: string | null;
  rowCount: number;
}> {
  const coverage = await latestWeekCoverage(season);
  const rowCount =
    coverage.latestWeek == null
      ? 0
      : await prisma.playerWeekStat.count({
          where: {
            season,
            week: coverage.latestWeek,
            leagueId: NFLVERSE_LEAGUE_ID,
          },
        });
  return {
    latestWeek: coverage.latestWeek,
    updatedAt: coverage.updatedAt?.toISOString() ?? null,
    rowCount,
  };
}
