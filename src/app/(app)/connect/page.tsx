import { auth } from "@/lib/auth";
import { getUserLeagueConnection } from "@/lib/league/service";
import { ConnectLeagueForm } from "@/components/connect-league-form";

export default async function ConnectPage() {
  const session = await auth();
  const isGuest = Boolean(session?.user?.isGuest);
  const row = session?.user?.id
    ? await getUserLeagueConnection(session.user.id)
    : null;

  const connection = row
    ? {
        leagueId: row.leagueId,
        season: row.season,
        leagueName: row.leagueName,
        isDemo: row.isDemo,
        teamId: row.teamId,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      }
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="type-page text-emerald-950">Get your league</h1>
        <p className="type-body mt-2 max-w-2xl text-emerald-950/65">
          Pick demo or ESPN — both are available up front. Your choice stays on
          this {isGuest ? "guest" : "signed-in"} account; use{" "}
          <span className="font-semibold text-emerald-950">Sync</span> later to
          refresh. Guest and signed-in accounts do not share leagues.
        </p>
      </div>
      <ConnectLeagueForm connection={connection} isGuest={isGuest} />
    </div>
  );
}
