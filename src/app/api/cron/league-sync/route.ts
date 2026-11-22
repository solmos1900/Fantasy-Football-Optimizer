import { NextResponse } from "next/server";
import { runScheduledLeagueSync } from "@/lib/league/scheduled-sync";
import { errorMessage, sendOpsAlert } from "@/lib/ops/alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron → refresh every connected league older than 6 h (rosters,
 * records, matchups, free agents). Scheduled twice a day in vercel.json.
 *
 * Secure with CRON_SECRET (Authorization: Bearer <secret>).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runScheduledLeagueSync();
    // Alert only when most syncs fail (an upstream outage), not for the odd
    // expired ESPN cookie.
    if (result.failed >= 3 && result.failed > result.synced) {
      await sendOpsAlert({
        title: "League sync cron: most syncs failed",
        detail: `${result.failed} failed, ${result.synced} synced. First error: ${result.failures[0]?.error ?? "?"}`,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/league-sync] failed", err);
    await sendOpsAlert({ title: "League sync cron failed", detail: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
