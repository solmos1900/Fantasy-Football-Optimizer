import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";
import { InsightsBoard } from "@/components/insights/insights-board";
import { buildRosterInsightsSignals } from "@/lib/insights/roster-signals";
import {
  enrichPlayersWithSnapshots,
  loadTrendMap,
  refreshProjectionTrends,
} from "@/lib/insights/trends";

export default async function InsightsPage() {
  const session = await auth();
  const rawLeague = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!rawLeague) {
    return (
      <EmptyLeagueConnect
        title="Insights"
        message="Connect an ESPN league to unlock roster signals — weekly points, usage, matchup chips, and waiver watch. Trade Analyzer / Who to Start work without a league."
      />
    );
  }

  try {
    await refreshProjectionTrends(rawLeague);
  } catch {
    // best-effort — Insights still renders from live roster + nflverse
  }

  let trendMap = await loadTrendMap(rawLeague);
  if (trendMap.size === 0) {
    const { computeTrendsFromLeague } = await import("@/lib/insights/trends");
    trendMap = computeTrendsFromLeague(rawLeague);
  }
  const league = enrichPlayersWithSnapshots(rawLeague, trendMap);

  const you =
    league.teams.find((t) => t.isCurrentUser) ??
    league.teams.find((t) => t.id === league.userTeamId) ??
    league.teams[0] ??
    null;

  if (!you) {
    return (
      <p className="type-body text-emerald-950/55">
        No team found for this league connection.
      </p>
    );
  }

  const bundle = await buildRosterInsightsSignals(league, you);

  return <InsightsBoard you={you} bundle={bundle} />;
}
