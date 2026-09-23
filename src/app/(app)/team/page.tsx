import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { PlayerRow } from "@/components/player-row";
import { PendingLink } from "@/components/pending-link";
import { sortByEspnRosterOrder } from "@/lib/roster-order";

export default async function TeamPage() {
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <EmptyConnect message="Connect a league to view your roster, starters, and bench." />
    );
  }

  const team =
    league.teams.find((t) => t.isCurrentUser) ??
    league.teams.find((t) => t.id === league.userTeamId) ??
    league.teams[0];

  if (!team) {
    return <p className="text-sm text-emerald-950/60">No team found in league data.</p>;
  }

  const ordered = sortByEspnRosterOrder(team.roster);
  const starters = ordered.filter((p) => p.isStarter);
  const bench = ordered.filter((p) => !p.isStarter);
  const starterProj = starters.reduce((a, p) => a + p.projectedPoints, 0);
  const starterAct = starters.reduce((a, p) => a + p.actualPoints, 0);

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <p className="type-eyebrow text-orange-700">
          Week {league.currentWeek} roster
        </p>
        <h1 className="type-page text-emerald-950">{team.name}</h1>
        <p className="mt-2 text-sm text-emerald-950/60">
          Starters{" "}
          <span className="type-stat text-2xl text-emerald-950">
            {starterAct.toFixed(1)}
          </span>
          <span className="text-emerald-950/40"> actual </span>
          vs{" "}
          <span className="type-stat text-2xl text-orange-600">
            {starterProj.toFixed(1)}
          </span>
          <span className="text-emerald-950/40"> projected</span>
        </p>
      </div>

      <section className="animate-fade-up-delay cork-board p-3 sm:p-4">
        <div className="surface-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="type-section text-emerald-950">Starters</h2>
            <span className="stamp stamp-start">★ Start</span>
          </div>
          <div>
            {starters.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="animate-fade-up-delay-2 cork-board p-3 sm:p-4">
        <div className="surface-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="type-section text-emerald-950">Bench</h2>
            <span className="stamp stamp-sit">Sit</span>
          </div>
          <div>
            {bench.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function EmptyConnect({ message }: { message: string }) {
  return (
    <div className="max-w-lg">
      <h1 className="type-page text-emerald-950">My Team</h1>
      <p className="type-body mt-2 text-emerald-950/65">{message}</p>
      <PendingLink
        href="/connect"
        className="mt-4 inline-flex text-sm font-semibold text-orange-700"
      >
        Connect league →
      </PendingLink>
    </div>
  );
}
