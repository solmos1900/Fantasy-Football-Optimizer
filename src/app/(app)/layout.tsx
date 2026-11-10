import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { ConnectGuideHost } from "@/components/onboarding/connect-guide-host";
import { getUserLeagueConnection } from "@/lib/league/service";
import {
  ATTRIBUTION_COOKIE,
  normalizeAttributionSource,
  recordActiveDay,
} from "@/lib/analytics/events";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Daily-active marker for WAU (one row per user per UTC day), written after
  // the response. Request data must be read before after() in a layout.
  const activeUserId = session.user.id;
  if (activeUserId) {
    const isGuest = Boolean(session.user.isGuest);
    const source = normalizeAttributionSource(
      (await cookies()).get(ATTRIBUTION_COOKIE)?.value,
    );
    after(() => recordActiveDay({ userId: activeUserId, isGuest, source }));
  }

  const connection = session.user.id
    ? await getUserLeagueConnection(session.user.id)
    : null;

  const league = connection
    ? {
        name: connection.leagueName,
        isDemo: connection.isDemo,
      }
    : null;

  return (
    <div className="flex min-h-dvh flex-col bg-transparent">
      <AppNav league={league} />
      {/*
        Bottom padding clears the fixed primary tab bar (incl. safe-area).
        Chat home sizes itself to the remaining viewport so its composer
        stays pinned above the nav; other pages scroll normally over this pad.
      */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-4 pb-[var(--app-bottom-nav-clearance)] sm:pt-6">
        {children}
      </div>
      <ConnectGuideHost />
    </div>
  );
}
