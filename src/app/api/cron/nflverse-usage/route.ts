import { NextResponse } from "next/server";
import { defaultEspnSeason } from "@/lib/season";
import {
  ingestNflverseWeek,
  latestCompletedWeek,
} from "@/lib/nflverse/ingest";

/**
 * Vercel Cron → fill league-agnostic PlayerWeekStat usage from nflverse.
 *
 * Secure with CRON_SECRET (Authorization: Bearer <secret>).
 * Processes **one** season/week per invocation (chunk-friendly for maxDuration).
 *
 * Query (optional):
 *   ?season=2026&week=4  — explicit week
 *   ?season=2026         — latest REG week present in nflverse file
 *
 * Schedule: see vercel.json (Tue/Wed morning PT after MNF).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const seasonParam = url.searchParams.get("season");
    const weekParam = url.searchParams.get("week");

    const season = seasonParam
      ? Number(seasonParam)
      : defaultEspnSeason();
    if (!Number.isInteger(season) || season < 1999) {
      return NextResponse.json({ error: "Invalid season" }, { status: 400 });
    }

    let week: number;
    if (weekParam != null) {
      week = Number(weekParam);
      if (!Number.isInteger(week) || week < 1 || week > 22) {
        return NextResponse.json({ error: "Invalid week" }, { status: 400 });
      }
    } else {
      const latest = await latestCompletedWeek(season);
      if (latest == null) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "No REG weeks found in nflverse stats file for season",
          season,
        });
      }
      week = latest;
    }

    const result = await ingestNflverseWeek({ season, week });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/nflverse-usage] failed", err);
    const message = err instanceof Error ? err.message : "nflverse ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
