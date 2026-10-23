/**
 * Resolve ESPN ids → FantasyPlayer from the no-league pool (or league roster union).
 */

import { getNoLeaguePlayerPool } from "@/lib/players/pool";
import { getLeagueDataForUser } from "@/lib/league/service";
import { loadToolDisplayMeta } from "@/lib/insights/tool-display";
import { buildTradeTeammateInjuryIndex } from "@/lib/insights/build-trade-injury-index";
import type { FantasyPlayer, LeagueData, PlayerTrendView } from "@/lib/types";
import type { PlayerPoolFreshness } from "@/lib/players/pool";
import type { ToolDisplayMeta } from "@/lib/insights/tool-display";
import {
  hydrateTeammateInjuryIndex,
  type TeammateInjuryIndex,
} from "@/lib/insights/teammate-injury";

export type ChatDataContext = {
  playersByEspnId: Map<number, FantasyPlayer>;
  trends: Record<string, PlayerTrendView>;
  freshness: PlayerPoolFreshness;
  meta: ToolDisplayMeta;
  teammateInjury: TeammateInjuryIndex | null;
  /** Phantom or real league context for WTS. */
  league: LeagueData;
  hasConnectedLeague: boolean;
};

export async function loadChatDataContext(options: {
  userId: string | null;
}): Promise<ChatDataContext> {
  const league = options.userId
    ? await getLeagueDataForUser(options.userId)
    : null;

  if (league) {
    const poolById = new Map<number, FantasyPlayer>();
    for (const team of league.teams) {
      for (const p of team.roster) poolById.set(p.espnId, p);
    }
    for (const p of league.freeAgents ?? []) poolById.set(p.espnId, p);

    // Fill gaps from NFL pool so @ mentions of non-roster players still work.
    const nfl = await getNoLeaguePlayerPool();
    for (const p of nfl.players) {
      if (!poolById.has(p.espnId)) poolById.set(p.espnId, p);
    }

    const players = [...poolById.values()];
    const [meta, teammateInjury] = await Promise.all([
      loadToolDisplayMeta({ season: league.season, players }),
      buildTradeTeammateInjuryIndex(players, league.season),
    ]);

    return {
      playersByEspnId: poolById,
      trends: nfl.trends,
      freshness: nfl.freshness,
      meta,
      teammateInjury: hydrateTeammateInjuryIndex(teammateInjury),
      league,
      hasConnectedLeague: true,
    };
  }

  const pool = await getNoLeaguePlayerPool();
  const playersByEspnId = new Map<number, FantasyPlayer>();
  for (const p of pool.players) playersByEspnId.set(p.espnId, p);
  const [meta, teammateInjury] = await Promise.all([
    loadToolDisplayMeta({
      season: pool.freshness.season,
      players: pool.players,
    }),
    buildTradeTeammateInjuryIndex(pool.players, pool.freshness.season),
  ]);

  return {
    playersByEspnId,
    trends: pool.trends,
    freshness: pool.freshness,
    meta,
    teammateInjury: hydrateTeammateInjuryIndex(teammateInjury),
    league: pool.contextLeague,
    hasConnectedLeague: false,
  };
}

export function resolvePlayers(
  ctx: ChatDataContext,
  espnIds: number[],
): { players: FantasyPlayer[]; missing: number[] } {
  const players: FantasyPlayer[] = [];
  const missing: number[] = [];
  const seen = new Set<number>();
  for (const id of espnIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const p = ctx.playersByEspnId.get(id);
    if (p) players.push(p);
    else missing.push(id);
  }
  return { players, missing };
}
