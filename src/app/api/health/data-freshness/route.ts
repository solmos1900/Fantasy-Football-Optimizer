import { NextResponse } from "next/server";
import { buildDataFreshnessReport } from "@/lib/accuracy/data-freshness";
import { defaultEspnSeason } from "@/lib/season";

export const runtime = "nodejs";

/**
 * Read-only data freshness for nflverse cron + golden check.
 *
 * Auth: public. Payload is non-sensitive (weeks, timestamps, run counts,
 * pass/fail flags). No secrets, cookies, user ids, or league data.
 * Optional `?season=YYYY` (defaults to DEFAULT_ESPN_SEASON).
 *
 * If you later need to restrict it, gate with Authorization: Bearer $CRON_SECRET
 * the same way as /api/cron/* — not required today.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const seasonParam = url.searchParams.get("season");
    const season = seasonParam
      ? Number(seasonParam)
      : defaultEspnSeason();
    if (!Number.isFinite(season) || season < 1999 || season > 2100) {
      return NextResponse.json({ error: "Invalid season" }, { status: 400 });
    }

    const report = await buildDataFreshnessReport({ season, runLimit: 10 });
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (err) {
    console.error("[health/data-freshness] failed", err);
    const message =
      err instanceof Error ? err.message : "data freshness check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
