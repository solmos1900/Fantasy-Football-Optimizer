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
import {
  runPoolDataValidation,
  syncNflverseFreshnessIssues,
} from "@/lib/accuracy/data-issues";
import { persistNflverseSyncRun } from "@/lib/nflverse/sync-log";
import { assessWeekCompleteness } from "@/lib/nflverse/week-completeness";

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
 * Every run is logged to EspnRawResponse (view=nflverse_sync) for
 * GET /api/health/data-freshness. Stale/incomplete weeks open DataIssue rows.
 *
 * Versioned rebuild (#136 / #141): ENABLED by default after merge. Logs a
 * dry-run plan + before/after health probes, then clears espn_category
 * leftovers and force-reingests W1..N in batches (data-version stamp; resumes
 * across runs). Kill-switch: DATA_REBUILD_DISABLED=1.
 *
 * ESPN category cleanup (#147): one-time purge of gap-fill espn_category
 * actuals that landed after the #141 rebuild. Same kill-switch. nflverse is
 * the only source of guest-pool actual points — never fill from ESPN gamelog.
 *
 * Secure with CRON_SECRET (Authorization: Bearer <secret>).
 * Optional query: ?season=2026&week=4 — defaults to DEFAULT_ESPN_SEASON + latest REG week.
 * Schedule: see vercel.json (Tue 17:00 UTC / 10 AM MST / noon CDT, Wed 14:00 UTC).
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
  const runAt = new Date(runStartedMs).toISOString();
  let season = defaultEspnSeason();
  let week: number | null = null;

  try {
    const url = new URL(request.url);
    const seasonParam = url.searchParams.get("season");
    const weekParam = url.searchParams.get("week");

    season = seasonParam ? Number(seasonParam) : defaultEspnSeason();
    if (!Number.isFinite(season) || season < 1999 || season > 2100) {
      return NextResponse.json({ error: "Invalid season" }, { status: 400 });
    }

    const explicitWeek = weekParam != null && weekParam !== "";
    if (explicitWeek) {
      week = Number(weekParam);
      if (!Number.isFinite(week) || week < 1 || week > 22) {
        return NextResponse.json({ error: "Invalid week" }, { status: 400 });
      }
    } else {
      week = await detectLatestNflverseWeek(season);
    }

    // Versioned force-rebuild. Runs before coverage backfill so stale formula
    // rows and espn_category pollution are corrected once (#141).
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
    // leave W1–W4 empty (#126).
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

    let golden: {
      ok: boolean;
      error?: string;
      failureCount?: number;
      failures?: string[];
    } | null = null;
    try {
      const goldenResult = await runGoldenAccuracyCheck();
      await persistGoldenCheckResult(goldenResult);
      golden = goldenResult;
      if (!goldenResult.ok) {
        console.error(
          "[cron/nflverse-usage] golden accuracy failed",
          goldenResult.failureCount,
          goldenResult.failures.slice(0, 5),
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

    const completeness = await assessWeekCompleteness({ season, week });
    const freshnessIssues = await syncNflverseFreshnessIssues({
      season,
      week,
      stale: completeness.stale,
      weekComplete: completeness.weekComplete,
      missingTeams: completeness.missingTeams,
      latestWeekInDb: completeness.latestWeekInDb,
      latestCompletedWeekEspn: completeness.latestCompletedWeekEspn,
    });

    await persistNflverseSyncRun({
      runAt,
      season,
      week,
      sourceFiles: result.sourceFiles ?? [],
      fetchedRows: result.fetchedRows,
      upsertedRows: result.weekStatsUpserted,
      goldenCheckOk: golden?.ok ?? null,
      goldenCheckError: golden?.error ?? null,
      weekComplete: completeness.weekComplete,
      missingTeams: completeness.missingTeams,
      stale: completeness.stale,
      error: null,
    });

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
      completeness,
      freshnessIssues,
    });
  } catch (err) {
    console.error("[cron/nflverse-usage] failed", err);
    const message = err instanceof Error ? err.message : "nflverse ingest failed";

    try {
      await persistNflverseSyncRun({
        runAt,
        season,
        week,
        sourceFiles: [],
        fetchedRows: null,
        upsertedRows: null,
        goldenCheckOk: null,
        goldenCheckError: null,
        weekComplete: null,
        missingTeams: null,
        stale: true,
        error: message,
      });
      await syncNflverseFreshnessIssues({
        season,
        week,
        stale: true,
        weekComplete: null,
        error: message,
      });
    } catch (logErr) {
      console.error("[cron/nflverse-usage] failed to persist run log", logErr);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
