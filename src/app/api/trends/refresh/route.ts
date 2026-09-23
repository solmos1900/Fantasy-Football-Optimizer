import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import {
  computeTrendsFromLeague,
  enrichPlayersWithSnapshots,
  loadTrendMap,
  refreshProjectionTrends,
} from "@/lib/insights/trends";

/**
 * On-demand trend refresh for Vercel (no fragile long cron).
 * Call after sync or from Insights — stores weekly proj/actual snapshots
 * and recomputes PlayerTrendMetric rows.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await getLeagueDataForUser(session.user.id);
  if (!league) {
    return NextResponse.json({ error: "No league connected" }, { status: 400 });
  }

  try {
    const result = await refreshProjectionTrends(league);
    const trendMap = await loadTrendMap(league);
    return NextResponse.json({
      ok: true,
      ...result,
      playersWithTrends: trendMap.size,
      sourceNote:
        "Snapshots use ESPN Fantasy league scoring (or demo seed). Heuristic projections fill gaps when ESPN history is thin — never FantasyPros.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trend refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Read trend map for the current user's league (DB first, in-memory fallback). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await getLeagueDataForUser(session.user.id);
  if (!league) {
    return NextResponse.json({ error: "No league connected" }, { status: 400 });
  }

  let trendMap = await loadTrendMap(league);
  if (trendMap.size === 0) {
    trendMap = computeTrendsFromLeague(league);
  }
  const enriched = enrichPlayersWithSnapshots(league, trendMap);

  return NextResponse.json({
    ok: true,
    season: league.season,
    leagueId: league.leagueId,
    week: league.scoringPeriodId,
    trends: [...trendMap.values()],
    samplePlayerRecentWeeks: enriched.teams
      .find((t) => t.isCurrentUser)
      ?.roster.slice(0, 3)
      .map((p) => ({
        name: p.name,
        recentWeeks: p.recentWeeks,
      })),
  });
}
