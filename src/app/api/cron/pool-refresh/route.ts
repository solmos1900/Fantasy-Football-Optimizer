import { NextResponse } from "next/server";
import { refreshPlayerPoolSnapshot } from "@/lib/players/pool-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Rebuild the no-league player pool snapshot (projections, injuries, roster
 * authority). Pages already trigger a background rebuild when the snapshot is
 * older than 10 min; schedule this route every ~10 min on game days if the
 * plan allows sub-daily crons (Vercel Pro) or from an external scheduler.
 *
 * Secure with CRON_SECRET (Authorization: Bearer <secret>).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { stored, bundle } = await refreshPlayerPoolSnapshot();
    return NextResponse.json({
      ok: true,
      stored,
      players: bundle.players.length,
      currentWeek: bundle.freshness.currentWeek,
      statsThroughWeek: bundle.freshness.statsThroughWeek,
      warning: bundle.freshness.warning,
    });
  } catch (err) {
    console.error("[cron/pool-refresh] failed", err);
    const message = err instanceof Error ? err.message : "pool refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
