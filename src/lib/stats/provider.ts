/**
 * Stats provider — prefers free ESPN public scoreboard for live leagues.
 * Demo leagues get clearly labeled demo live stats. Live ESPN leagues never
 * fall back to demo top-performer names/points.
 */

import type { LeagueData, LiveStatSnapshot } from "@/lib/types";
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

  if (!league || league.isDemo) {
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
