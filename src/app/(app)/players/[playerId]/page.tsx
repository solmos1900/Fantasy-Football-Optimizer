import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
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
  const recent = [...(player.recentWeeks ?? [])]
    .sort((a, b) => b.week - a.week)
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="animate-fade-up">
        <Link
          href="/team"
          className="text-xs font-semibold uppercase tracking-wider text-orange-700 hover:text-orange-600"
        >
          ← My Team
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
              {player.position} · {player.nflTeam}
              {teamName ? ` · ${teamName}` : " · Free agent"}
              {league.isDemo ? " · Demo data" : " · ESPN sync"}
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
              {player.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-emerald-950/60">
              <span>{player.opponent ?? "Opponent TBD"}</span>
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
              {player.actualPoints > 0 ? player.actualPoints.toFixed(1) : "—"}
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
          Same position / role vs {player.opponent ?? "this week’s opponent"} in
          prior weeks (league history + seeded comps). Concrete point totals —
          not guesses.
        </p>
        {insight.comps.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-950/50">
            No comparable samples yet for this matchup.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {insight.comps.map((c) => (
              <li
                key={`${c.week}-${c.playerName}`}
                className="border-b border-emerald-950/5 py-2 text-sm text-emerald-950/80"
              >
                <span className="font-semibold text-emerald-950">
                  {c.playerName}
                </span>{" "}
                ({c.role}) scored{" "}
                <span className="font-[family-name:var(--font-display)] text-lg text-orange-600">
                  {c.points.toFixed(1)}
                </span>{" "}
                in week {c.week}.
              </li>
            ))}
          </ul>
        )}
        {insight.matchupSummary && (
          <p className="mt-3 text-sm text-emerald-950/65">{insight.matchupSummary}</p>
        )}
      </section>

      <p className="text-xs text-emerald-950/45">
        Numbers refresh when you Sync the league. Live actuals update with the
        scoreboard poll on Home.
      </p>
    </div>
  );
}
