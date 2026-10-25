import { NextResponse } from "next/server";
import { runEphemeralCleanup } from "@/lib/cleanup/ephemeral";
import { errorMessage, sendOpsAlert } from "@/lib/ops/alert";

/**
 * Vercel Cron → purge expired guests, Auth sessions, verification tokens,
 * and trim oversized ephemeral league caches.
 *
 * Secure with CRON_SECRET (Authorization: Bearer <secret>).
 * Schedule: see vercel.json (`0 8 * * *` = 08:00 UTC daily).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runEphemeralCleanup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/cleanup] failed", err);
    await sendOpsAlert({ title: "Cleanup cron failed", detail: errorMessage(err) });
    const message = err instanceof Error ? err.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
