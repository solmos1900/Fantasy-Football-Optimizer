/**
 * Gap-fill leagueId="" PlayerWeekStat.actualPpr from ESPN gamelog when
 * nflverse left the week null (never overwrites nflverse_ppr).
 */

import { prisma } from "@/lib/db";
import { NFLVERSE_LEAGUE_ID } from "@/lib/nflverse/map";
import { fetchEspnGamelogPpr } from "@/lib/players/espn-gamelog";

export async function fillEspnGamelogGaps(options: {
  season: number;
  /** Inclusive completed weeks to consider. */
  throughWeek: number;
  espnIds: number[];
}): Promise<{ filled: number; checked: number }> {
  const ids = [...new Set(options.espnIds.filter((id) => id > 0))];
  let filled = 0;
  let checked = 0;

  for (const espnId of ids) {
    checked += 1;
    const existing = await prisma.playerWeekStat.findMany({
      where: {
        espnId,
        season: options.season,
        leagueId: NFLVERSE_LEAGUE_ID,
        week: { gte: 1, lte: options.throughWeek },
      },
      select: {
        week: true,
        actualPpr: true,
        actualSource: true,
        snapShare: true,
      },
    });
    const byWeek = new Map(existing.map((r) => [r.week, r]));
    // Candidate weeks: missing row, or row with null PPR (not nflverse_ppr).
    const needs = new Set<number>();
    for (let w = 1; w <= options.throughWeek; w++) {
      const row = byWeek.get(w);
      if (!row) {
        needs.add(w);
        continue;
      }
      if (
        row.actualPpr == null &&
        row.actualSource !== "nflverse_ppr"
      ) {
        needs.add(w);
      }
    }
    if (needs.size === 0) continue;

    const gamelog = await fetchEspnGamelogPpr({
      espnId,
      season: options.season,
    });
    if (!gamelog.length) continue;

    const player = await prisma.player.findUnique({ where: { espnId } });
    if (!player) continue;

    for (const g of gamelog) {
      if (!needs.has(g.week)) continue;
      const prev = byWeek.get(g.week);
      if (prev?.actualSource === "nflverse_ppr" && prev.actualPpr != null) {
        continue;
      }
      await prisma.playerWeekStat.upsert({
        where: {
          espnId_season_week_leagueId: {
            espnId,
            season: options.season,
            week: g.week,
            leagueId: NFLVERSE_LEAGUE_ID,
          },
        },
        create: {
          playerId: player.id,
          espnId,
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          season: options.season,
          week: g.week,
          scoringFormat: "PPR",
          actualPpr: g.actualPpr,
          actualSource: "espn_category",
          opponent: g.opponent,
          source: "espn",
          leagueId: NFLVERSE_LEAGUE_ID,
        },
        update: {
          actualPpr: g.actualPpr,
          actualSource: "espn_category",
          ...(g.opponent ? { opponent: g.opponent } : {}),
        },
      });
      filled += 1;
    }
  }

  return { filled, checked };
}
