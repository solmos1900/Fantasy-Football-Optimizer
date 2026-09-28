import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { SyncButton } from "@/components/sync-button";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";
import { PendingLink } from "@/components/pending-link";
import { LeagueStandings } from "@/components/league-standings";

export default async function LeaguePage() {
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <EmptyLeagueConnect
        title="League"
        message="Load a demo league or connect ESPN to see standings, matchups, and every roster."
      />
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="animate-fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-eyebrow text-orange-700">
            Season {league.season}
            {league.isDemo ? " · Demo" : " · ESPN"}
          </p>
          <h1 className="type-page text-emerald-950">{league.name}</h1>
          <p className="type-caption mt-1.5 text-emerald-950/55">
            Saved on your account · Last sync{" "}
            {new Date(league.lastSyncedAt).toLocaleString()} ·{" "}
            <PendingLink href="/connect" className="font-semibold text-orange-700 hover:text-orange-600">
              Manage connection
            </PendingLink>
          </p>
        </div>
        <SyncButton />
      </div>

      <section className="animate-fade-up-delay surface-card p-3 sm:p-4">
        <h2 className="type-section mb-1 px-1 text-emerald-950 sm:px-1.5">
          Standings
        </h2>
        <p className="mb-2 px-1 text-sm text-emerald-950/50 sm:px-1.5">
          Tap a team to view its roster.
        </p>
        <LeagueStandings teams={league.teams} />
      </section>

      <section className="animate-fade-up-delay-2">
        <h2 className="type-section mb-3 text-emerald-950">
          Week {league.currentWeek} matchups
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {league.matchups.map((m) => {
            const home = league.teams.find((t) => t.id === m.homeTeamId);
            const away = league.teams.find((t) => t.id === m.awayTeamId);
            return (
              <div
                key={m.id}
                className="rounded-xl border border-emerald-950/8 bg-[color-mix(in_srgb,var(--kraft)_35%,var(--surface))] px-3.5 py-3"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{away?.name ?? "Away"}</span>
                  <span className="type-stat text-xl">{m.awayScore.toFixed(1)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{home?.name ?? "Home"}</span>
                  <span className="type-stat text-xl">{m.homeScore.toFixed(1)}</span>
                </div>
                <p className="mt-1 text-xs text-emerald-950/45">
                  Proj {m.awayProjected.toFixed(1)} – {m.homeProjected.toFixed(1)}
                  {m.isLive ? " · live" : ""}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
