import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { EmptyRosterSlot, PlayerRow } from "@/components/player-row";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";
import { sortByEspnRosterOrder } from "@/lib/roster-order";

export default async function TeamPage() {
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <EmptyLeagueConnect
        title="My Team"
        message="Load a demo league or connect ESPN to view your roster, starters, and bench."
      />
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
  const injuredReserve = ordered.filter((p) => (p.slot ?? "") === "IR");
  const bench = ordered.filter(
    (p) => !p.isStarter && (p.slot ?? "") !== "IR",
  );
  const starterProj = starters.reduce((a, p) => a + p.projectedPoints, 0);
  const starterAct = starters.reduce((a, p) => a + p.actualPoints, 0);
  const weekLabel = `WK${league.currentWeek}`;

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="type-eyebrow text-orange-700">My Team</p>
            <h1 className="type-page text-emerald-950">{team.name}</h1>
          </div>
          <p className="type-eyebrow text-emerald-950/55">
            Week {league.currentWeek}
          </p>
        </div>
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

      <RosterSection
        title="Starters"
        stamp={<span className="stamp stamp-start">★ Start</span>}
        delayClass="animate-fade-up-delay"
      >
        {starters.map((p) => (
          <PlayerRow key={p.id} player={p} weekLabel={weekLabel} />
        ))}
      </RosterSection>

      <RosterSection
        title="Bench"
        stamp={<span className="stamp stamp-sit">Sit</span>}
        delayClass="animate-fade-up-delay-2"
      >
        {bench.map((p) => (
          <PlayerRow key={p.id} player={p} weekLabel={weekLabel} />
        ))}
      </RosterSection>

      <RosterSection
        title="Injured Reserve"
        delayClass="animate-fade-up-delay-2"
      >
        {injuredReserve.length > 0 ? (
          injuredReserve.map((p) => (
            <PlayerRow key={p.id} player={p} weekLabel={weekLabel} />
          ))
        ) : (
          <EmptyRosterSlot slot="IR" label="Empty" />
        )}
      </RosterSection>
    </div>
  );
}

function RosterSection({
  title,
  stamp,
  delayClass,
  children,
}: {
  title: string;
  stamp?: ReactNode;
  delayClass: string;
  children: ReactNode;
}) {
  return (
    <section className={delayClass}>
      <div className="mb-2 flex flex-wrap items-center gap-2 px-0.5">
        <h2 className="type-section text-emerald-950">{title}</h2>
        {stamp}
      </div>
      <div className="surface-card divide-y divide-emerald-950/10 px-1.5 py-1 sm:px-2">
        {children}
      </div>
    </section>
  );
}
