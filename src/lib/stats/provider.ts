import type { LeagueData, LiveGame, LiveStatSnapshot } from "@/lib/types";
import { createDemoLiveStats } from "@/lib/demo/seed";
import { fetchEspnScoreboard } from "@/lib/espn/client";

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
      events?: Array<{
        id: string;
        status?: {
          type?: { state?: string; detail?: string; shortDetail?: string };
          period?: number;
          displayClock?: string;
        };
        competitions?: Array<{
          competitors?: Array<{
            homeAway?: string;
            score?: string;
            team?: { abbreviation?: string };
          }>;
        }>;
      }>;
    };

    const games: LiveGame[] = (raw.events ?? []).slice(0, 12).map((event) => {
      const comp = event.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === "home");
      const away = comp?.competitors?.find((c) => c.homeAway === "away");
      const state = event.status?.type?.state ?? "pre";
      let status: LiveGame["status"] = "scheduled";
      if (state === "in") status = "in_progress";
      if (state === "post") status = "final";

      return {
        id: event.id,
        home: home?.team?.abbreviation ?? "HOME",
        away: away?.team?.abbreviation ?? "AWAY",
        homeScore: Number(home?.score ?? 0),
        awayScore: Number(away?.score ?? 0),
        status,
        quarter: status === "in_progress" ? `Q${event.status?.period ?? ""}` : undefined,
        clock: status === "in_progress" ? event.status?.displayClock : undefined,
      };
    });

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
      games,
      topPerformers: performers.length ? performers : createDemoLiveStats(week).topPerformers,
    };
  } catch {
    return createDemoLiveStats(week);
  }
}
