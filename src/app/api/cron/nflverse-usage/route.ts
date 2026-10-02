import { NextResponse } from "next/server";
import { defaultEspnSeason } from "@/lib/season";
import {
  detectLatestNflverseWeek,
  ingestNflverseUsage,
} from "@/lib/nflverse";

export const runtime = "nodejs";
/** Weekly CSV fetch + batch upserts can exceed the default hobby limit. */
export const maxDuration = 300;

/**
 * Vercel Cron → ingest one nflverse season/week of usage into PlayerWeekStat
 * (leagueId = "", source = nflverse). ESPN sync still owns league PPR.
 *
 * Secure with CRON_SECRET (Authorization: Bearer <secret>).
 * Optional query: ?season=2026&week=4 — defaults to DEFAULT_ESPN_SEASON + latest REG week.
 * Schedule: see vercel.json.
 */
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
    if (!Number.isFinite(season) || season < 1999 || season > 2100) {
      return NextResponse.json({ error: "Invalid season" }, { status: 400 });
    }

    let week: number;
    if (weekParam != null && weekParam !== "") {
      week = Number(weekParam);
      if (!Number.isFinite(week) || week < 1 || week > 22) {
        return NextResponse.json({ error: "Invalid week" }, { status: 400 });
      }
    } else {
      week = await detectLatestNflverseWeek(season);
    }

    const result = await ingestNflverseUsage({
      season,
      week,
      includeSnaps: true,
      mergeIntoLeagueRows: true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/nflverse-usage] failed", err);
    const message = err instanceof Error ? err.message : "nflverse ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
