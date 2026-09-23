import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { PlayersDirectory } from "@/components/players-directory";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";

export default async function PlayersPage() {
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <EmptyLeagueConnect
        title="Players"
        message="Load a demo league or connect ESPN to search the player pool with ownership and projections."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="type-page text-emerald-950">Player directory</h1>
        <p className="type-body mt-2 text-emerald-950/60">
          Owned players and free agents with ownership %, projections, and
          actuals.
        </p>
      </div>
      <div className="animate-fade-up-delay surface-card p-4 sm:p-5">
        <PlayersDirectory league={league} />
      </div>
    </div>
  );
}
