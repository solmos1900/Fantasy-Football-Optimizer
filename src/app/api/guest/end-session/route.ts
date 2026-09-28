import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteGuestUserById } from "@/lib/cleanup/ephemeral";

/**
 * Wipe the current guest user (and cascaded league/demo rows) before JWT sign-out.
 * Real accounts are untouched — returns { wiped: false }.
 */
export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: true, wiped: false, reason: "no-session" });
  }

  if (!session.user?.isGuest) {
    return NextResponse.json({ ok: true, wiped: false, reason: "not-guest" });
  }

  try {
    const wiped = await deleteGuestUserById(userId);
    return NextResponse.json({ ok: true, wiped });
  } catch (err) {
    console.error("[guest/end-session] failed", err);
    const message = err instanceof Error ? err.message : "Failed to end guest session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
