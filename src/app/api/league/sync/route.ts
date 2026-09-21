import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshUserLeague } from "@/lib/league/service";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const league = await refreshUserLeague(session.user.id);
    return NextResponse.json({ ok: true, league });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
