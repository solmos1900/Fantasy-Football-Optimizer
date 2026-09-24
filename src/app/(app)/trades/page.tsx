import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import {
  computeTrendsFromLeague,
  enrichPlayersWithSnapshots,
  loadTrendMap,
} from "@/lib/insights/trends";
import { TradeAnalyzer } from "@/components/trade-analyzer";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";
import type { FantasyPlayer, PlayerTrendView } from "@/lib/types";

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{
    partner?: string;
    give?: string;
    get?: string;
  }>;
}) {
  const session = await auth();
  const rawLeague = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;
  const params = await searchParams;

  if (!rawLeague) {
    return (
      <EmptyLeagueConnect
        title="Trade Analyzer"
        message="Load a demo league or connect ESPN to build and grade trades with your 1QB full-PPR chip values and roster needs."
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

  // Plain object so trends survive RSC → client serialization (Map does not).
  const trendsByEspnId: Record<string, PlayerTrendView> = {};
  for (const [espnId, trend] of trendMap) {
    trendsByEspnId[String(espnId)] = trend;
  }

  // Dedupe league + FA universe by player id for PvP search corpus.
  const poolById = new Map<string, FantasyPlayer>();
  for (const team of league.teams) {
    for (const player of team.roster) {
      if (!poolById.has(player.id)) poolById.set(player.id, player);
    }
  }
  for (const player of league.freeAgents) {
    if (!poolById.has(player.id)) poolById.set(player.id, player);
  }

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="type-page text-emerald-950">Trade Analyzer</h1>
        <p className="type-body mt-2 max-w-2xl text-emerald-950/65">
          Build a trade in three steps: pick what you give, pick what you get,
          then see a short verdict — reason, value difference, and who wins the
          deal.
        </p>
      </div>

      <TradeAnalyzer
        you={you}
        partners={partners}
        poolPlayers={[...poolById.values()]}
        trends={trendsByEspnId}
        initialPartnerId={
          partnerId != null && !Number.isNaN(partnerId) ? partnerId : undefined
        }
        initialGiveIds={giveIds}
        initialReceiveIds={receiveIds}
        isDemo={league.isDemo}
      />
    </div>
  );
}
