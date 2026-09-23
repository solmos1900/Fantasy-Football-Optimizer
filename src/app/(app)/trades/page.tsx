import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import {
  computeTrendsFromLeague,
  enrichPlayersWithSnapshots,
  loadTrendMap,
} from "@/lib/insights/trends";
import { TradeAnalyzer } from "@/components/trade-analyzer";
import type { PlayerTrendView } from "@/lib/types";

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
      <div className="max-w-lg">
        <h1 className="type-page text-emerald-950">Trade Analyzer</h1>
        <p className="type-body mt-2 text-emerald-950/65">
          Connect a league (or load the demo league as a guest) to build and
          grade trades with your 1QB full-PPR chip values and roster needs.
        </p>
        <Link
          href="/connect"
          className="mt-4 inline-flex text-sm font-semibold text-orange-700"
        >
          Connect league →
        </Link>
      </div>
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

  const trendsByEspnId = new Map<number, PlayerTrendView>();
  for (const [espnId, trend] of trendMap) {
    trendsByEspnId.set(espnId, trend);
  }

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="type-page text-emerald-950">Trade Analyzer</h1>
        <p className="type-body mt-2 max-w-2xl text-emerald-950/65">
          Build a package with any league mate, then get an instant plain-language
          grade — chip totals, hard rejects (no naked QB↔skill), For you / For
          them, and a partner acceptance lean band. Same 1QB full-PPR norms as
          Insights suggestions — not a fake win probability.
        </p>
      </div>

      <TradeAnalyzer
        you={you}
        partners={partners}
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
