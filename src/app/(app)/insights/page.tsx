import { auth } from "@/lib/auth";
import { getLeagueDataForUser, resolveUserTeam } from "@/lib/league/service";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";
import { SelectTeamPrompt } from "@/components/select-team-prompt";
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

  const selected = resolveUserTeam(rawLeague);
  if (!selected) {
    return <SelectTeamPrompt title="Pick your team for Insights" />;
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

  const you = resolveUserTeam(league);

  if (!you) {
    return <SelectTeamPrompt title="Pick your team for Insights" />;
  }

  const bundle = await buildRosterInsightsSignals(league, you);

  return <InsightsBoard you={you} bundle={bundle} />;
}
