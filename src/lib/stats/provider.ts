/**
 * Stats provider — prefers free ESPN public scoreboard for live leagues.
 * Never falls back to fabricated demo top-performer names/points.
 */

import type { LeagueData, LiveStatSnapshot } from "@/lib/types";
import { pointsOrZero } from "@/lib/utils";
import { fetchEspnScoreboard } from "@/lib/espn/client";
import {
  parseEspnScoreboard,
  type ScoreboardEvent,
} from "@/lib/espn/scoreboard";

export async function getLiveStats(
  league: LeagueData | null,
): Promise<LiveStatSnapshot> {
  const week = league?.currentWeek ?? 1;
  const season = league?.season;

  try {
    const raw = (await fetchEspnScoreboard(week, season)) as {
      events?: ScoreboardEvent[];
    };
    const { games } = parseEspnScoreboard(raw);

    const performers = (league?.teams ?? [])
      .flatMap((t) => t.roster)
      .filter(
        (p) =>
          typeof p.actualPoints === "number" &&
          Number.isFinite(p.actualPoints) &&
          p.actualPoints > 0,
      )
      .sort((a, b) => pointsOrZero(b.actualPoints) - pointsOrZero(a.actualPoints))
      .slice(0, 5)
      .map((p) => ({
        playerName: p.name,
        position: p.position,
        points: pointsOrZero(p.actualPoints),
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
