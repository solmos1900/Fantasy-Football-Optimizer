/**
 * Stats provider — prefers free ESPN public scoreboard for live leagues.
 * Fabricated seed-only demo may use labeled seed live stats. Real read-only
 * demo leagues (shared ESPN connection) use the public scoreboard + roster
 * actuals — never invented top-performer points.
 */

import type { LeagueData, LiveStatSnapshot } from "@/lib/types";
import { isFabricatedSeedLeague } from "@/lib/demo/config";
import { createDemoLiveStats } from "@/lib/demo/seed";
import { fetchEspnScoreboard } from "@/lib/espn/client";
import {
  parseEspnScoreboard,
  type ScoreboardEvent,
} from "@/lib/espn/scoreboard";

export async function getLiveStats(
  league: LeagueData | null,
): Promise<LiveStatSnapshot> {
  const week = league?.currentWeek ?? 3;
  const season = league?.season;

  // Only the old in-memory seed uses fabricated live stats.
  if (!league || isFabricatedSeedLeague(league)) {
    return createDemoLiveStats(week);
  }

  try {
    const raw = (await fetchEspnScoreboard(week, season)) as {
      events?: ScoreboardEvent[];
    };
    const { games } = parseEspnScoreboard(raw);

    // Derive top performers from league roster actuals for the week — real only.
    const performers = (league.teams ?? [])
      .flatMap((t) => t.roster)
      .filter((p) => p.actualPoints > 0)
      .sort((a, b) => b.actualPoints - a.actualPoints)
      .slice(0, 5)
      .map((p) => ({
        playerName: p.name,
        position: p.position,
        points: p.actualPoints,
        team: p.nflTeam,
      }));

    return {
      week,
      updatedAt: new Date().toISOString(),
      games: games.slice(0, 12),
      topPerformers: performers,
    };
  } catch {
    return {
      week,
      updatedAt: new Date().toISOString(),
      games: [],
      topPerformers: [],
    };
  }
}
