import { NextResponse } from "next/server";
import { defaultEspnSeason } from "@/lib/season";
import {
  backfillMissingNflverseWeeks,
  detectLatestNflverseWeek,
  ingestNflverseUsage,
  runEspnCategoryActualsCleanup,
  runNflverseActualsRebuild,
} from "@/lib/nflverse";
import {
  persistGoldenCheckResult,
  runGoldenAccuracyCheck,
} from "@/lib/accuracy/golden-check";
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
 * Versioned rebuild (#136): ENABLED by default after merge. Logs a dry-run
 * plan + before/after health probes, then clears espn_category leftovers and
 * force-reingests W1..N in batches (data-version stamp; resumes across runs).
 * Kill-switch: DATA_REBUILD_DISABLED=1.
 *
 * ESPN category cleanup (#147): one-time purge of gap-fill espn_category
 * actuals that landed after the #141 rebuild. Same kill-switch. nflverse is
 * the only source of guest-pool actual points — never fill from ESPN gamelog.
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

    // One-time purge of espn_category actuals left by the removed gap-fill (#147).
    const espnCategoryCleanup = await runEspnCategoryActualsCleanup({
      season,
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
      espnCategoryCleanup: {
        mode: espnCategoryCleanup.mode,
        skipped: espnCategoryCleanup.skipped,
        skipReason: espnCategoryCleanup.skipReason,
        complete: espnCategoryCleanup.complete,
        targetVersion: espnCategoryCleanup.targetVersion,
        appliedVersionAfter: espnCategoryCleanup.appliedVersionAfter,
        beforeCount: espnCategoryCleanup.beforeCount,
        afterCount: espnCategoryCleanup.afterCount,
        cleared: espnCategoryCleanup.cleared,
      },
      golden,
      poolValidation,
    });
  } catch (err) {
    console.error("[cron/nflverse-usage] failed", err);
    const message = err instanceof Error ? err.message : "nflverse ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
