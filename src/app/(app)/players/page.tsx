import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { PlayersDirectory } from "@/components/players-directory";

export default async function PlayersPage() {
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <div className="max-w-lg">
        <h1 className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide">
          Players
        </h1>
        <p className="mt-2 text-sm text-emerald-950/65">
          Search the player pool with ownership and projections after connecting a league.
        </p>
        <Link href="/connect" className="mt-4 inline-flex text-sm font-semibold text-orange-700">
          Connect league →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
          Player directory
        </h1>
        <p className="mt-2 text-sm text-emerald-950/60">
          Owned players and free agents with ownership %, projections, and actuals.
        </p>
      </div>
      <div className="animate-fade-up-delay">
        <PlayersDirectory league={league} />
      </div>
    </div>
  );
}
