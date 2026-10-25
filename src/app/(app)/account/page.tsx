import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserLeagueConnection } from "@/lib/league/service";
import { DeleteAccountPanel } from "@/components/delete-account-panel";
import { PendingLink } from "@/components/pending-link";

export default async function AccountPage() {
  const session = await auth();
  const userId = session?.user?.id;
  const isGuest = Boolean(session?.user?.isGuest);

  const [user, connection] = userId
    ? await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, createdAt: true },
        }),
        getUserLeagueConnection(userId),
      ])
    : [null, null];

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="type-page text-emerald-950">Account</h1>
        <dl className="type-body mt-4 space-y-2 text-sm text-emerald-950/70">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-emerald-950/50">Name</dt>
            <dd>{user?.name ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-emerald-950/50">Sign-in</dt>
            <dd>{isGuest ? "Guest (temporary)" : (user?.email ?? "—")}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-emerald-950/50">League</dt>
            <dd>
              {connection
                ? `${connection.leagueName ?? `ESPN ${connection.leagueId}`} (${connection.season})`
                : "None connected"}
            </dd>
          </div>
        </dl>
        {isGuest && (
          <p className="type-caption mt-3 text-emerald-950/55">
            Guest data is deleted when you sign out, or automatically within 24
            hours.
          </p>
        )}
      </div>

      <DeleteAccountPanel isGuest={isGuest} />

      <p className="type-caption text-emerald-950/55">
        <PendingLink href="/terms" className="underline underline-offset-2">
          Terms of Service
        </PendingLink>
        {" · "}
        <PendingLink href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </PendingLink>
      </p>
    </div>
  );
}
