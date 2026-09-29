import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import {
  buildPlayerDetailInsight,
  findPlayerInLeague,
} from "@/lib/insights/player-detail";
import {
  computeTrendsFromLeague,
  enrichPlayersWithSnapshots,
  loadTrendMap,
  refreshProjectionTrends,
} from "@/lib/insights/trends";
import {
  fetchEspnPlayerNews,
  newsFromRosterInjuries,
} from "@/lib/espn/news";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";
import { PlayerDetailSheet } from "@/components/player-detail-sheet";

export const dynamic = "force-dynamic";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const session = await auth();
  const rawLeague = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!rawLeague) {
    return (
      <EmptyLeagueConnect
        title="Player"
        message="Load a demo league or connect ESPN to open player drill-downs with projections and defense comps."
      />
    );
  }

  try {
    await refreshProjectionTrends(rawLeague);
  } catch {
    // best-effort
  }
  let trendMap = await loadTrendMap(rawLeague);
  if (trendMap.size === 0) {
    trendMap = computeTrendsFromLeague(rawLeague);
  }
  const league = enrichPlayersWithSnapshots(rawLeague, trendMap);

  const found = findPlayerInLeague(league, decodeURIComponent(playerId));
  if (!found) notFound();

  const { player } = found;
  const playerTrend = trendMap.get(player.espnId) ?? null;
  const insight = buildPlayerDetailInsight(league, player, playerTrend);

  let news = await fetchEspnPlayerNews([player], 6);
  if (!news.length) {
    news = newsFromRosterInjuries([player]).slice(0, 3);
  } else {
    // Prefer headlines that mention this player by name.
    const named = news.filter((n) =>
      n.playerNames?.some(
        (pn) => pn.toLowerCase() === player.name.toLowerCase(),
      ),
    );
    news = (named.length ? named : news).slice(0, 4);
  }

  return (
    <PlayerDetailSheet
      player={player}
      league={league}
      insight={insight}
      trend={playerTrend}
      news={news}
      scoringLabel="PPR"
    />
  );
}
