import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { formatRecord } from "@/lib/utils";
import { PlayerRow } from "@/components/player-row";

export default async function LeaguePage() {
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <div className="max-w-lg">
        <h1 className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide">
          League
        </h1>
        <p className="mt-2 text-sm text-emerald-950/65">
          Connect a league to see standings, matchups, and every roster.
        </p>
        <Link href="/connect" className="mt-4 inline-flex text-sm font-semibold text-orange-700">
          Connect league →
        </Link>
      </div>
    );
  }

  const standings = [...league.teams].sort(
    (a, b) => a.standing - b.standing || b.pointsFor - a.pointsFor,
  );

  return (
    <div className="space-y-10">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">
          Season {league.season}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
          {league.name}
        </h1>
      </div>

      <section className="animate-fade-up-delay">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide">
          Standings
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-emerald-950/10 text-xs uppercase tracking-wider text-emerald-950/45">
                <th className="py-2 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">Team</th>
                <th className="py-2 pr-2 font-semibold">Record</th>
                <th className="py-2 pr-2 font-semibold">PF</th>
                <th className="py-2 font-semibold">PA</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-emerald-950/5 ${t.isCurrentUser ? "bg-orange-50/60" : ""}`}
                >
                  <td className="py-2.5 pr-2 font-[family-name:var(--font-display)] text-lg">
                    {t.standing}
                  </td>
                  <td className="py-2.5 pr-2 font-medium">
                    {t.name}
                    {t.isCurrentUser && (
                      <span className="ml-2 text-[10px] font-semibold uppercase text-orange-700">
                        you
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2">
                    {formatRecord(t.wins, t.losses, t.ties)}
                  </td>
                  <td className="py-2.5 pr-2">{t.pointsFor.toFixed(1)}</td>
                  <td className="py-2.5">{t.pointsAgainst.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="animate-fade-up-delay-2">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide">
          Week {league.currentWeek} matchups
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {league.matchups.map((m) => {
            const home = league.teams.find((t) => t.id === m.homeTeamId);
            const away = league.teams.find((t) => t.id === m.awayTeamId);
            return (
              <div key={m.id} className="border-b border-emerald-950/10 pb-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{away?.name ?? "Away"}</span>
                  <span className="font-[family-name:var(--font-display)] text-xl">
                    {m.awayScore.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{home?.name ?? "Home"}</span>
                  <span className="font-[family-name:var(--font-display)] text-xl">
                    {m.homeScore.toFixed(1)}
                  </span>
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

      <section>
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide">
          Rosters
        </h2>
        <div className="space-y-8">
          {standings.map((t) => (
            <div key={t.id}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-emerald-950/50">
                {t.name}
              </h3>
              <div>
                {t.roster
                  .filter((p) => p.isStarter)
                  .slice(0, 9)
                  .map((p) => (
                    <PlayerRow key={p.id} player={p} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
