import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { PlayerRow } from "@/components/player-row";

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

  const starters = team.roster.filter((p) => p.isStarter);
  const bench = team.roster.filter((p) => !p.isStarter);
  const starterProj = starters.reduce((a, p) => a + p.projectedPoints, 0);
  const starterAct = starters.reduce((a, p) => a + p.actualPoints, 0);

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">
          Week {league.currentWeek} roster
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
          {team.name}
        </h1>
        <p className="mt-2 text-sm text-emerald-950/60">
          Starters{" "}
          <span className="font-[family-name:var(--font-display)] text-2xl text-emerald-950">
            {starterAct.toFixed(1)}
          </span>
          <span className="text-emerald-950/40"> actual </span>
          vs{" "}
          <span className="font-[family-name:var(--font-display)] text-2xl text-orange-600">
            {starterProj.toFixed(1)}
          </span>
          <span className="text-emerald-950/40"> projected</span>
        </p>
      </div>

      <section className="animate-fade-up-delay">
        <h2 className="mb-2 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-emerald-950">
          Starters
        </h2>
        <div>
          {starters.map((p) => (
            <PlayerRow key={p.id} player={p} />
          ))}
        </div>
      </section>

      <section className="animate-fade-up-delay-2">
        <h2 className="mb-2 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-emerald-950">
          Bench
        </h2>
        <div>
          {bench.map((p) => (
            <PlayerRow key={p.id} player={p} />
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyConnect({ message }: { message: string }) {
  return (
    <div className="max-w-lg">
      <h1 className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide">
        My Team
      </h1>
      <p className="mt-2 text-sm text-emerald-950/65">{message}</p>
      <Link
        href="/connect"
        className="mt-4 inline-flex text-sm font-semibold text-orange-700"
      >
        Connect league →
      </Link>
    </div>
  );
}
