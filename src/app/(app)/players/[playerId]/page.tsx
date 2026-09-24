import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { getLiveStats } from "@/lib/stats/provider";
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
import { TrendPanel } from "@/components/trend-panel";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";

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

  const { player, teamName } = found;
  const playerTrend = trendMap.get(player.espnId) ?? null;
  const insight = buildPlayerDetailInsight(league, player, playerTrend);
  const live = await getLiveStats(league);
  const recent = [...(player.recentWeeks ?? [])]
    .sort((a, b) => b.week - a.week)
    .slice(0, 6);

  const liveGame = live.games.find(
    (g) => g.home === player.nflTeam || g.away === player.nflTeam,
  );
  const livePoints =
    player.actualPoints > 0
      ? player.actualPoints
      : live.topPerformers.find(
          (p) => p.playerName.toLowerCase() === player.name.toLowerCase(),
        )?.points;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">
      <div className="animate-fade-up">
        <Link
          href="/team"
          className="text-xs font-semibold uppercase tracking-wider text-orange-700 hover:text-orange-600"
        >
          ← My Team
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
              {player.position} · {player.nflTeam}
              {teamName ? ` · ${teamName}` : " · Free agent"}
              {league.isDemo ? " · Demo data" : " · ESPN sync"}
            </p>
            <h1 className="type-page text-emerald-950">
              {player.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-emerald-950/60">
              <span>{insight.venue.label}</span>
              {player.injuryStatus !== "ACTIVE" && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    statusColor(player.injuryStatus),
                  )}
                >
                  {formatStatusCode(player.injuryStatus)}
                </span>
              )}
              <span>
                {player.percentOwned.toFixed(0)}% owned ·{" "}
                {player.percentStarted.toFixed(0)}% started
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-950/45">
              This week
            </p>
            <p className="type-stat text-3xl text-orange-600">
              {livePoints != null && livePoints > 0
                ? livePoints.toFixed(1)
                : "—"}
            </p>
            <p className="text-xs text-emerald-950/50">
              proj {player.projectedPoints.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      <section className="animate-fade-up-delay cork-board tape-card p-4 sm:p-5">
        <div className="surface-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "stamp animate-stamp text-xs",
              insight.lean === "START"
                ? "stamp-start"
                : insight.lean === "FLEX"
                  ? "stamp-flex"
                  : "stamp-sit",
            )}
          >
            {insight.lean === "START" ? "★ " : ""}
            {insight.lean}
          </span>
          <h2 className="type-section text-emerald-950">
            {insight.headline}
          </h2>
        </div>
        {insight.dataThin && (
          <p className="mt-2 text-xs text-emerald-950/55">
            Early season — not many games on record yet, so this lean leans more
            on this week&apos;s projection and the matchup.
          </p>
        )}
        <ul className="mt-3 space-y-1.5">
          {insight.reasons.map((r) => (
            <li
              key={r}
              className="flex gap-2 text-sm leading-relaxed text-emerald-950/80"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-500" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
        </div>
      </section>

      <section className="animate-fade-up-delay-2">
        <h2 className="type-section text-emerald-950">
          This week&apos;s matchup
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-emerald-950/45">
              Opponent / venue
            </dt>
            <dd className="mt-0.5 font-medium text-emerald-950">
              {insight.venue.label}
              {insight.venue.venue === "away"
                ? " (road)"
                : insight.venue.venue === "home"
                  ? " (home)"
                  : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-emerald-950/45">
              Injury
            </dt>
            <dd className="mt-0.5 font-medium text-emerald-950">
              {formatStatusCode(player.injuryStatus) === "IR"
                ? "On the IR"
                : formatStatusCode(player.injuryStatus)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-emerald-950/45">
              Scoreboard
            </dt>
            <dd className="mt-0.5 font-medium text-emerald-950">
              {liveGame
                ? `${liveGame.away} ${liveGame.awayScore} @ ${liveGame.home} ${liveGame.homeScore} · ${liveGame.status === "in_progress" ? `${liveGame.quarter ?? "LIVE"} ${liveGame.clock ?? ""}` : liveGame.status}`
                : "No live game found for this NFL team right now"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-emerald-950/45">
              Snapshot
            </dt>
            <dd className="mt-0.5 text-emerald-950/70">
              Live board refreshed {new Date(live.updatedAt).toLocaleTimeString()}{" "}
              · week {live.week}
            </dd>
          </div>
        </dl>
        {insight.matchupSummary && (
          <p className="mt-3 text-sm text-emerald-950/70">{insight.matchupSummary}</p>
        )}
      </section>

      <section>
        <h2 className="type-section text-emerald-950">Recent scoring</h2>
        <p className="type-body mt-1 text-emerald-950/55">
          How projected points compare to what they actually scored — used to
          spot heating up / cooling off for start/sit and trades.
        </p>
        <div className="mt-3">
          <TrendPanel trend={playerTrend} />
        </div>
      </section>

      <section>
        <h2 className="type-section text-emerald-950">Recent weeks</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-950/50">
            No prior-week PPR totals stored yet for this player.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[18rem] text-left text-sm">
              <thead>
                <tr className="border-b border-emerald-950/10 text-xs uppercase tracking-wider text-emerald-950/45">
                  <th className="py-2 pr-2 font-semibold">Week</th>
                  <th className="py-2 pr-2 font-semibold">Opp</th>
                  <th className="py-2 pr-2 font-semibold">Proj</th>
                  <th className="py-2 font-semibold">PPR</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((w) => (
                  <tr key={w.week} className="border-b border-emerald-950/5">
                    <td className="py-2 pr-2 type-stat text-lg">
                      {w.week}
                    </td>
                    <td className="py-2 pr-2 text-emerald-950/70">
                      {w.opponent ?? "—"}
                    </td>
                    <td className="py-2 pr-2 text-emerald-950/70">
                      {w.projectedPoints != null
                        ? w.projectedPoints.toFixed(1)
                        : "—"}
                    </td>
                    <td className="py-2 font-semibold text-emerald-950">
                      {w.points.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="type-section text-emerald-950">
          Similar players vs this defense
        </h2>
        <p className="mt-1 text-sm text-emerald-950/55">
          Same position / role vs {insight.venue.abbrev ?? "this opponent"} in
          completed weeks only
          {league.isDemo ? " (Demo league history)" : " (from your ESPN league sync)"}.
          Point totals are real scored weeks — never invented comps.
        </p>
        {insight.comps.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-950/50">
            {insight.compsEmptyMessage ??
              `Not enough completed games of similar players vs ${insight.venue.abbrev ?? "this defense"} yet this season.`}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {insight.comps.map((c) => (
              <li
                key={`${c.week}-${c.playerName}`}
                className="border-b border-emerald-950/5 py-2 text-sm leading-relaxed text-emerald-950/80"
              >
                {c.blurb}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-emerald-950/45">
        Open this page anytime for a fresh pull. Sync the league to refresh
        roster/injury projections; the scoreboard poll on Home keeps live games
        current.
      </p>
    </div>
  );
}
