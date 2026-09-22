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
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
          Connect league
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-emerald-950/65">
          Connect once — the league ID (and private cookies if needed) stay on
          this {isGuest ? "guest" : "signed-in"} account. Later visits use{" "}
          <span className="font-semibold text-emerald-950">Sync</span> to refresh
          data, not re-entry. Guest and signed-in accounts do not share leagues.
        </p>
      </div>
      <ConnectLeagueForm connection={connection} isGuest={isGuest} />
    </div>
  );
}
