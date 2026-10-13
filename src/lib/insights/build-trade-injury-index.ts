/**
 * Build teammate-injury index for Trade Analyzer (league or no-league pool).
 */

import { prisma } from "@/lib/db";
import {
  applyInjuryReport,
  fetchEspnInjuryReport,
} from "@/lib/espn/injuries";
import {
  buildTeammateInjuryIndex,
  serializeTeammateInjuryIndex,
} from "@/lib/insights/teammate-injury";
import { fetchNflWeekSnapshot } from "@/lib/players/week";
import type { FantasyPlayer, PlayerPosition } from "@/lib/types";

export async function buildTradeTeammateInjuryIndex(
  players: FantasyPlayer[],
  season: number,
): Promise<ReturnType<typeof serializeTeammateInjuryIndex>> {
  const snap = await fetchNflWeekSnapshot(season).catch(() => null);
  const through = snap?.latestCompletedWeek ?? 0;
  const report = await fetchEspnInjuryReport();

  const teams = [
    ...new Set(players.map((p) => p.nflTeam).filter((t) => t && t !== "FA")),
  ];
  const extras = teams.length
    ? await prisma.player.findMany({
        where: {
          nflTeam: { in: teams },
          position: { in: ["QB", "RB", "WR", "TE"] },
        },
        take: 500,
      })
    : [];

  const byEspn = new Map<number, FantasyPlayer>();
  for (const p of players) byEspn.set(p.espnId, p);
  for (const p of extras) {
    if (byEspn.has(p.espnId)) continue;
    byEspn.set(p.espnId, {
      id: `espn-${p.espnId}`,
      espnId: p.espnId,
      name: p.name,
      position: p.position as PlayerPosition,
      nflTeam: p.nflTeam ?? "FA",
      injuryStatus: "ACTIVE",
      projectedPoints: 0,
      actualPoints: 0,
      percentOwned: 0,
      percentStarted: 0,
    });
  }

  const pool = applyInjuryReport([...byEspn.values()], report);
  const index = await buildTeammateInjuryIndex({
    season,
    statsThroughWeek: through,
    players: pool.map((p) => ({
      espnId: p.espnId,
      name: p.name,
      position: p.position,
      nflTeam: p.nflTeam,
      injuryStatus: p.injuryStatus,
      projectedPoints: p.projectedPoints,
    })),
  });
  return serializeTeammateInjuryIndex(index);
}
