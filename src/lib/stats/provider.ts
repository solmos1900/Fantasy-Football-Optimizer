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
import { fetchNflWeekSnapshot } from "@/lib/players/week";
import { defaultEspnSeason } from "@/lib/season";

export async function getLiveStats(
  league: LeagueData | null,
): Promise<LiveStatSnapshot> {
  // Guests (no league) use the same NFL week/season lookup as the player pool
  // (`fetchNflWeekSnapshot`) — never default week to 1 with a blank season.
  let week: number | undefined;
  let season: number | undefined;

  if (league) {
    week = league.currentWeek;
    season = league.season;
  } else {
    season = defaultEspnSeason();
    try {
      const snap = await fetchNflWeekSnapshot(season);
      week = snap.currentWeek;
      season = snap.season;
    } catch {
      // Leave week unset so ESPN returns the live current slate (not Week 1).
    }
  }

  try {
    const raw = (await fetchEspnScoreboard(week, season)) as {
      events?: ScoreboardEvent[];
      week?: { number?: number };
    };
    const { games } = parseEspnScoreboard(raw);

    const boardWeek = Number(raw.week?.number);
    const resolvedWeek =
      week ??
      (Number.isFinite(boardWeek) && boardWeek > 0 ? boardWeek : 1);

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
      week: resolvedWeek,
      updatedAt: new Date().toISOString(),
      // Full NFL week can be up to 16 games; do not artificially cap below that.
      games,
      topPerformers: performers,
    };
  } catch {
    return {
      week: week ?? 1,
      updatedAt: new Date().toISOString(),
      games: [],
      topPerformers: [],
    };
  }
}
