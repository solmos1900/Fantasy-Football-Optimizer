import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { getLiveStats } from "@/lib/stats/provider";
import { generateInsights } from "@/lib/insights/engine";
import { LiveStatsPanel } from "@/components/live-stats-panel";
import { SyncButton } from "@/components/sync-button";
import { InstallHowToLink } from "@/components/install-app";
import { buttonVariants } from "@/components/ui/button";
import { formatRecord } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <div className="animate-fade-up max-w-xl">
        <h1 className="type-page text-emerald-950">
          Welcome
          {session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="type-body mt-3 text-emerald-950/65">
          Connect a demo league or your ESPN fantasy football league to unlock
          your dashboard, roster, and insights.
        </p>
        <Link
          href="/connect"
          className={buttonVariants({
            variant: "primary",
            className: "mt-6",
          })}
        >
          Connect league
        </Link>
        <p className="type-caption mt-4 text-emerald-950/50">
          On iPhone? <InstallHowToLink /> for a Home Screen shortcut.
        </p>
      </div>
    );
  }

  const team =
    league.teams.find((t) => t.isCurrentUser) ??
    league.teams.find((t) => t.id === league.userTeamId) ??
    league.teams[0];
  const live = await getLiveStats(league);
  const allInsights = generateInsights(league);
  const waiverCount = allInsights.filter((i) => i.type === "waiver").length;
  const insights = allInsights.slice(0, 3);
  const matchup = league.matchups.find(
    (m) => m.homeTeamId === team?.id || m.awayTeamId === team?.id,
  );

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-eyebrow text-orange-700">
            {league.isDemo ? "Demo league" : "ESPN synced"} · Week{" "}
            {league.currentWeek}
          </p>
          <h1 className="type-page mt-1 text-emerald-950">{league.name}</h1>
          <p className="type-caption mt-1.5 text-emerald-950/55">
            Last sync {new Date(league.lastSyncedAt).toLocaleString()}
          </p>
        </div>
        <SyncButton />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:gap-10">
        <section className="animate-fade-up-delay space-y-8">
          <div className="cork-board p-3 sm:p-4">
          <div className="surface-card p-5">
            <h2 className="type-section text-emerald-950">Your team</h2>
            {team && (
              <div className="mt-3 space-y-2">
                <p className="text-lg font-semibold tracking-tight text-emerald-950">
                  {team.name}{" "}
                  <span className="font-normal text-emerald-950/50">
                    ({formatRecord(team.wins, team.losses, team.ties)}) · #
                    {team.standing}
                  </span>
                </p>
                <p className="text-sm text-emerald-950/60">
                  <span className="type-stat text-base">
                    {team.pointsFor.toFixed(1)}
                  </span>{" "}
                  PF ·{" "}
                  <span className="type-stat text-base">
                    {team.pointsAgainst.toFixed(1)}
                  </span>{" "}
                  PA
                </p>
                {matchup && (
                  <p className="text-sm text-emerald-950">
                    This week:{" "}
                    <span className="type-stat text-2xl text-orange-600">
                      {(matchup.homeTeamId === team.id
                        ? matchup.homeScore
                        : matchup.awayScore
                      ).toFixed(1)}
                    </span>
                    <span className="text-emerald-950/40"> / proj </span>
                    <span className="type-stat">
                      {(matchup.homeTeamId === team.id
                        ? matchup.homeProjected
                        : matchup.awayProjected
                      ).toFixed(1)}
                    </span>
                  </p>
                )}
                <Link
                  href="/team"
                  className="inline-block text-sm font-semibold text-orange-700 hover:text-orange-800"
                >
                  View full roster →
                </Link>
              </div>
            )}
          </div>
          </div>

          <div className="surface-card p-5">
            <h2 className="type-section text-emerald-950">
              Top insights
              {waiverCount > 0 && (
                <span className="ml-2 align-middle rounded-md bg-orange-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  {waiverCount} waiver{waiverCount === 1 ? "" : "s"}
                </span>
              )}
            </h2>
            <ul className="mt-3 space-y-3">
              {insights.map((insight) => (
                <li
                  key={insight.id}
                  className="rounded-lg border-l-2 border-orange-500 bg-white/40 py-2 pl-3 pr-2"
                >
                  <p className="text-sm font-semibold text-emerald-950">
                    {insight.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-emerald-950/60">
                    {insight.summary}
                  </p>
                </li>
              ))}
              {!insights.length && (
                <li className="text-sm text-emerald-950/50">
                  No urgent recommendations this week.
                </li>
              )}
            </ul>
            <Link
              href="/insights"
              className="mt-3 inline-block text-sm font-semibold text-orange-700 hover:text-orange-800"
            >
              All insights →
            </Link>
          </div>
        </section>

        <div className="animate-fade-up-delay-2">
          <LiveStatsPanel initial={live} />
        </div>
      </div>
    </div>
  );
}
