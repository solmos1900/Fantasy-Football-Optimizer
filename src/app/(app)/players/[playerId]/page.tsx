import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { getLiveStats } from "@/lib/stats/provider";
import {
  buildPlayerDetailInsight,
  findPlayerInLeague,
} from "@/lib/insights/player-detail";
import { cn, statusColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <div className="max-w-lg">
        <h1 className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide">
          Player
        </h1>
        <p className="mt-2 text-sm text-emerald-950/65">
          Connect a league to open player drill-downs with projections and
          defense comps.
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

  const found = findPlayerInLeague(league, decodeURIComponent(playerId));
  if (!found) notFound();

  const { player, teamName } = found;
  const insight = buildPlayerDetailInsight(league, player);
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
            <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
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
                  {player.injuryStatus}
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
            <p className="font-[family-name:var(--font-display)] text-3xl text-orange-600">
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

      <section className="animate-fade-up-delay rounded-lg border border-emerald-950/10 bg-white/70 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white",
              insight.lean === "START"
                ? "bg-emerald-700"
                : insight.lean === "FLEX"
                  ? "bg-amber-600"
                  : "bg-orange-700",
            )}
          >
            {insight.lean}
          </span>
          <h2 className="font-[family-name:var(--font-display)] text-xl uppercase tracking-wide text-emerald-950">
            {insight.headline}
          </h2>
        </div>
        {insight.dataThin && (
          <p className="mt-2 text-xs text-emerald-950/55">
            Early-season / thin sample — lean uses whatever projection, form, and
            defense comps are available.
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
      </section>

      <section className="animate-fade-up-delay-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-emerald-950">
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
              {player.injuryStatus}
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
        <h2 className="font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-emerald-950">
          Recent weeks
        </h2>
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
                  <th className="py-2 font-semibold">PPR</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((w) => (
                  <tr key={w.week} className="border-b border-emerald-950/5">
                    <td className="py-2 pr-2 font-[family-name:var(--font-display)] text-lg">
                      {w.week}
                    </td>
                    <td className="py-2 pr-2 text-emerald-950/70">
                      {w.opponent ?? "—"}
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
        <h2 className="font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-emerald-950">
          Similar players vs this defense
        </h2>
        <p className="mt-1 text-sm text-emerald-950/55">
          Same position / role vs {insight.venue.abbrev ?? "this opponent"} in
          prior weeks. Concrete point totals from league history + seeded comps —
          not guesses.
        </p>
        {insight.comps.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-950/50">
            No comparable samples yet for this matchup.
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
