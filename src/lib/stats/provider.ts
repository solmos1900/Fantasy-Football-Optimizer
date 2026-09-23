import type { LeagueData, LiveStatSnapshot } from "@/lib/types";
import { createDemoLiveStats } from "@/lib/demo/seed";
import { fetchEspnScoreboard } from "@/lib/espn/client";
import {
  parseEspnScoreboard,
  type ScoreboardEvent,
} from "@/lib/espn/scoreboard";

/**
 * Stats provider — prefers free ESPN public scoreboard; falls back to demo.
 * No API key required for the public scoreboard endpoint.
 */
export async function getLiveStats(
  league: LeagueData | null,
): Promise<LiveStatSnapshot> {
  const week = league?.currentWeek ?? 7;
  const season = league?.season;

  if (!league || league.isDemo) {
    return createDemoLiveStats(week);
  }

  try {
    const raw = (await fetchEspnScoreboard(week, season)) as {
      events?: ScoreboardEvent[];
    };
    const { games } = parseEspnScoreboard(raw);

    // Derive top performers from league roster actuals for the week
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
      topPerformers: performers.length
        ? performers
        : createDemoLiveStats(week).topPerformers,
    };
  } catch {
    return createDemoLiveStats(week);
  }
}
