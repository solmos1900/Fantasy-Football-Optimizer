import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import {
  computeTrendsFromLeague,
  enrichPlayersWithSnapshots,
  loadTrendMap,
} from "@/lib/insights/trends";
import { getNoLeaguePlayerPool } from "@/lib/players/pool";
import { buildTradeTeammateInjuryIndex } from "@/lib/insights/build-trade-injury-index";
import { TradesHub } from "@/components/trades-hub";
import type { FantasyPlayer, FantasyTeam, PlayerTrendView } from "@/lib/types";

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{
    partner?: string;
    give?: string;
    get?: string;
    tool?: string;
  }>;
}) {
  const session = await auth();
  const rawLeague = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;
  const params = await searchParams;

  const initialTool =
    params.tool === "who-to-start" || params.tool === "start"
      ? "who-to-start"
      : "analyzer";

  // ── No league: full NFL player pool (DB-first + short TTL refresh) ──
  if (!rawLeague) {
    const pool = await getNoLeaguePlayerPool();
    const phantomYou: FantasyTeam = {
      id: 0,
      name: "Side A",
      abbrev: "A",
      ownerName: session?.user?.name ?? "You",
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      standing: 0,
      roster: [],
      isCurrentUser: true,
    };
    const teammateInjury = await buildTradeTeammateInjuryIndex(
      pool.players,
      pool.freshness.season,
    );

    return (
      <TradesHub
        league={pool.contextLeague}
        you={phantomYou}
        partners={[]}
        poolPlayers={pool.players}
        trends={pool.trends}
        isDemo={false}
        noLeague
        freshness={pool.freshness}
        initialTool={initialTool}
        teammateInjury={teammateInjury}
      />
    );
  }

  let trendMap = await loadTrendMap(rawLeague);
  if (trendMap.size === 0) {
    trendMap = computeTrendsFromLeague(rawLeague);
  }
  const league = enrichPlayersWithSnapshots(rawLeague, trendMap);

  const you =
    league.teams.find((t) => t.isCurrentUser) ??
    league.teams.find((t) => t.id === league.userTeamId) ??
    league.teams[0];

  if (!you) {
    return (
      <p className="type-body text-emerald-950/55">
        No team found for this league connection.
      </p>
    );
  }

  const partners = league.teams.filter((t) => t.id !== you.id);
  const partnerId = params.partner ? Number(params.partner) : undefined;
  const giveIds = params.give
    ? params.give.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const receiveIds = params.get
    ? params.get.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const trendsByEspnId: Record<string, PlayerTrendView> = {};
  for (const [espnId, trend] of trendMap) {
    trendsByEspnId[String(espnId)] = trend;
  }

  const poolById = new Map<string, FantasyPlayer>();
  for (const team of league.teams) {
    for (const player of team.roster) {
      if (!poolById.has(player.id)) poolById.set(player.id, player);
    }
  }
  for (const player of league.freeAgents) {
    if (!poolById.has(player.id)) poolById.set(player.id, player);
  }

  const teammateInjury = await buildTradeTeammateInjuryIndex(
    [...poolById.values()],
    league.season,
  );

  return (
    <TradesHub
      league={league}
      you={you}
      partners={partners}
      poolPlayers={[...poolById.values()]}
      trends={trendsByEspnId}
      initialPartnerId={
        partnerId != null && !Number.isNaN(partnerId) ? partnerId : undefined
      }
      initialGiveIds={giveIds}
      initialReceiveIds={receiveIds}
      isDemo={false}
      noLeague={false}
      initialTool={initialTool}
      teammateInjury={teammateInjury}
    />
  );
}
