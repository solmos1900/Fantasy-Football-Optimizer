import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshUserLeague } from "@/lib/league/service";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const league = await refreshUserLeague(session.user.id);
    return NextResponse.json({
      ok: true,
      lastSyncedAt: league.lastSyncedAt,
      league,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const status = /ESPN_COOKIE_ENCRYPTION_KEY|decrypt ESPN cookie/i.test(
      message,
    )
      ? 503
      : 400;
    console.error("[league/sync]", message);
    return NextResponse.json({ error: message, ok: false }, { status });
  }
}
