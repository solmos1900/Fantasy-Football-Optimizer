import { NextResponse } from "next/server";
import { defaultEspnSeason } from "@/lib/season";
import {
  backfillMissingNflverseWeeks,
  detectLatestNflverseWeek,
  ingestNflverseUsage,
  runNflverseActualsRebuild,
} from "@/lib/nflverse";
import {
  loadGoldenFixture,
  persistGoldenCheckResult,
  runGoldenAccuracyCheck,
} from "@/lib/accuracy/golden-check";
import { fillEspnGamelogGaps } from "@/lib/players/fill-espn-gaps";
import { runPoolDataValidation } from "@/lib/accuracy/data-issues";

export const runtime = "nodejs";
/** Weekly CSV fetch + batch upserts can exceed the default hobby limit. */
export const maxDuration = 300;

/**
 * Vercel Cron → ingest one nflverse season/week of usage into PlayerWeekStat
 * (leagueId = "", source = nflverse). ESPN sync still owns league-scoped PPR;
 * leagueId="" completed-week actuals are nflverse full-PPR.
 *
 * After ingest, re-validates tests/fixtures/golden-players.json and persists
 * a visible notice payload for Insights when assert mode fails.
 *
 * Optional versioned rebuild (#136): when NFLVERSE_ACTUALS_REBUILD_MODE=apply
 * (default off), clears espn_category leftovers and force-reingests W1..N in
 * batches keyed on a data-version stamp. dry-run logs only.
 *
 * Secure with CRON_SECRET (Authorization: Bearer <secret>).
 * Optional query: ?season=2026&week=4 — defaults to DEFAULT_ESPN_SEASON + latest REG week.
 * Schedule: see vercel.json (Tue/Wed).
 *
 * Coordination with draft PR #119: that PR adds sync-log / freshness around
 * this route. Keep both the backfill + rebuild calls and #119's logging when
 * merging.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Soft deadline so golden / pool validation still fit in maxDuration=300.
  const runStartedMs = Date.now();
  const rebuildDeadlineMs = runStartedMs + 240_000;

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
    const explicitWeek = weekParam != null && weekParam !== "";
    if (explicitWeek) {
      week = Number(weekParam);
      if (!Number.isFinite(week) || week < 1 || week > 22) {
        return NextResponse.json({ error: "Invalid week" }, { status: 400 });
      }
    } else {
      week = await detectLatestNflverseWeek(season);
    }

    // Versioned force-rebuild (default OFF). Runs before coverage backfill so
    // stale formula rows and espn_category pollution are corrected once.
    const rebuild = await runNflverseActualsRebuild({
      season,
      throughWeek: week,
      maxWeeksPerRun: explicitWeek ? 1 : 2,
      deadlineMs: rebuildDeadlineMs,
    });

    // Explicit ?week=N → single-week ingest (debug / manual). Default cron path
    // backfills every missing week 1..latest so mid-season cron start does not
    // leave W1–W4 empty (#126). Helper is isolated for coordination with #119.
    const backfill = explicitWeek
      ? null
      : await backfillMissingNflverseWeeks({
          season,
          throughWeek: week,
          includeSnaps: true,
          mergeIntoLeagueRows: true,
        });
    const result =
      backfill?.lastResult ??
      (await ingestNflverseUsage({
        season,
        week,
        includeSnaps: true,
        mergeIntoLeagueRows: true,
      }));

    // Secondary source: ESPN gamelog fills null-PPR gaps (e.g. Troy Franklin W4)
    // without overwriting nflverse_ppr.
    let espnGaps = { filled: 0, checked: 0 };
    try {
      const fixture = loadGoldenFixture();
      espnGaps = await fillEspnGamelogGaps({
        season,
        throughWeek: Math.max(week, fixture.season === season ? 5 : week),
        espnIds: fixture.players.map((p) => p.espnId),
      });
    } catch (gapErr) {
      console.warn("[cron/nflverse-usage] espn gap-fill skipped", gapErr);
    }

    let golden = null;
    try {
      golden = await runGoldenAccuracyCheck();
      await persistGoldenCheckResult(golden);
      if (!golden.ok) {
        console.error(
          "[cron/nflverse-usage] golden accuracy failed",
          golden.failureCount,
          golden.failures.slice(0, 5),
        );
      }
    } catch (gErr) {
      console.error("[cron/nflverse-usage] golden check error", gErr);
      golden = {
        ok: false,
        error: gErr instanceof Error ? gErr.message : "golden check failed",
      };
    }

    let poolValidation = null;
    try {
      poolValidation = await runPoolDataValidation({ season, week });
      console.info("[cron/nflverse-usage] pool validation", poolValidation);
    } catch (vErr) {
      console.error("[cron/nflverse-usage] pool validation error", vErr);
      poolValidation = {
        error: vErr instanceof Error ? vErr.message : "pool validation failed",
      };
    }

    return NextResponse.json({
      ok: true,
      ...result,
      actualsRebuild: {
        mode: rebuild.mode,
        skipped: rebuild.skipped,
        skipReason: rebuild.skipReason,
        complete: rebuild.complete,
        targetVersion: rebuild.targetVersion,
        appliedVersionAfter: rebuild.appliedVersionAfter,
        summary: rebuild.summary,
      },
      ...(backfill
        ? {
            backfill: {
              throughWeek: backfill.throughWeek,
              weeksIngested: backfill.weeksIngested,
              weeksSkipped: backfill.weeksSkipped,
              errors: backfill.errors,
            },
          }
        : {}),
      espnGaps,
      golden,
      poolValidation,
    });
  } catch (err) {
    console.error("[cron/nflverse-usage] failed", err);
    const message = err instanceof Error ? err.message : "nflverse ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
