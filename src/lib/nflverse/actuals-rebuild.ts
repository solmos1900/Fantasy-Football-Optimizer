/**
 * Version-stamped guest-pool actuals rebuild (#136).
 *
 * After #133/#134, production still held espn_category leftovers and weeks
 * stamped with the pre–fantasy_points_ppr formula. Ordinary
 * `backfillMissingNflverseWeeks` skips any week with ≥25 nflverse rows, so
 * those weeks never get rescored unless we force a re-ingest.
 *
 * This helper:
 * 1. Clears `actualSource=espn_category` on leagueId="" rows
 * 2. Force-reingests weeks 1..throughWeek from nflverse (overwrites)
 * 3. Records progress in EspnRawResponse under a data-version stamp so a
 *    later cron run continues / no-ops once complete
 *
 * Gated by NFLVERSE_ACTUALS_REBUILD_MODE (default off). Never enables itself.
 * Safe to re-run; batched with a soft deadline for Vercel maxDuration.
 */

import { prisma } from "@/lib/db";
import { ingestNflverseUsage } from "@/lib/nflverse/ingest";
import { NFLVERSE_LEAGUE_ID } from "@/lib/nflverse/map";
import { defaultEspnSeason } from "@/lib/season";

/** Bump when scoring/source contract changes and W1..N must be rewritten. */
export const NFLVERSE_ACTUALS_DATA_VERSION = 2;

export const NFLVERSE_REBUILD_LEAGUE_ID = "__nflverse_rebuild__";
export const NFLVERSE_REBUILD_VIEW = "nflverse_actuals_version";

export type NflverseActualsRebuildMode = "off" | "dry-run" | "apply";

export type NflverseActualsRebuildSummary = {
  espnCategoryRowsFound: number;
  espnCategoryRowsCleared: number;
  weeksPlanned: number[];
  weeksIngested: number[];
  weeksRemaining: number[];
  weekStatsUpserted: number;
  errors: Array<{ week: number; error: string }>;
};

export type NflverseActualsRebuildResult = {
  mode: NflverseActualsRebuildMode;
  season: number;
  throughWeek: number;
  targetVersion: number;
  appliedVersionBefore: number;
  appliedVersionAfter: number;
  skipped: boolean;
  skipReason: string | null;
  complete: boolean;
  summary: NflverseActualsRebuildSummary;
};

export type NflverseActualsVersionStamp = {
  kind: "nflverse_actuals_version";
  /** Last fully completed data version (0 = never). */
  appliedVersion: number;
  /**
   * When appliedVersion < workingTarget, completedWeeks is progress toward
   * workingTarget. When appliedVersion >= workingTarget, rebuild is done.
   */
  workingTarget: number;
  completedWeeks: number[];
  throughWeek: number | null;
  lastRunAt: string | null;
  lastMode: NflverseActualsRebuildMode | null;
  lastSummary: NflverseActualsRebuildSummary | null;
};

function emptySummary(): NflverseActualsRebuildSummary {
  return {
    espnCategoryRowsFound: 0,
    espnCategoryRowsCleared: 0,
    weeksPlanned: [],
    weeksIngested: [],
    weeksRemaining: [],
    weekStatsUpserted: 0,
    errors: [],
  };
}

function isStampBody(raw: unknown): raw is NflverseActualsVersionStamp {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    o.kind === "nflverse_actuals_version" &&
    typeof o.appliedVersion === "number" &&
    Array.isArray(o.completedWeeks)
  );
}

function emptyStamp(): NflverseActualsVersionStamp {
  return {
    kind: "nflverse_actuals_version",
    appliedVersion: 0,
    workingTarget: 0,
    completedWeeks: [],
    throughWeek: null,
    lastRunAt: null,
    lastMode: null,
    lastSummary: null,
  };
}

/**
 * Resolve rebuild mode from env. Default OFF so production is unchanged until
 * Sebastian sets NFLVERSE_ACTUALS_REBUILD_MODE=apply (or dry-run to log only).
 */
export function resolveNflverseActualsRebuildMode(
  env: Record<string, string | undefined> = process.env,
): NflverseActualsRebuildMode {
  const raw = (env.NFLVERSE_ACTUALS_REBUILD_MODE ?? "").trim().toLowerCase();
  if (
    raw === "apply" ||
    raw === "on" ||
    raw === "1" ||
    raw === "true" ||
    raw === "yes"
  ) {
    return "apply";
  }
  if (raw === "dry-run" || raw === "dryrun" || raw === "dry") {
    return "dry-run";
  }
  return "off";
}

export async function loadNflverseActualsVersionStamp(options?: {
  season?: number;
}): Promise<NflverseActualsVersionStamp> {
  const season = options?.season ?? defaultEspnSeason();
  const row = await prisma.espnRawResponse.findUnique({
    where: {
      espnLeagueId_season_view_week: {
        espnLeagueId: NFLVERSE_REBUILD_LEAGUE_ID,
        season,
        view: NFLVERSE_REBUILD_VIEW,
        week: 0,
      },
    },
  });
  if (row?.body && isStampBody(row.body)) {
    return {
      ...emptyStamp(),
      ...row.body,
      workingTarget:
        typeof row.body.workingTarget === "number"
          ? row.body.workingTarget
          : row.body.appliedVersion,
    };
  }
  return emptyStamp();
}

async function persistStamp(
  season: number,
  body: NflverseActualsVersionStamp,
): Promise<void> {
  const fetchedAt = new Date(body.lastRunAt ?? Date.now());
  await prisma.espnRawResponse.upsert({
    where: {
      espnLeagueId_season_view_week: {
        espnLeagueId: NFLVERSE_REBUILD_LEAGUE_ID,
        season,
        view: NFLVERSE_REBUILD_VIEW,
        week: 0,
      },
    },
    create: {
      espnLeagueId: NFLVERSE_REBUILD_LEAGUE_ID,
      season,
      view: NFLVERSE_REBUILD_VIEW,
      week: 0,
      body,
      fetchedAt,
    },
    update: {
      body,
      fetchedAt,
    },
  });
}

/** Pure: which weeks still need a forced re-ingest for this version. */
export function weeksNeedingForcedRebuild(
  throughWeek: number,
  completedWeeks: number[],
): number[] {
  const max = Math.floor(throughWeek);
  if (!Number.isFinite(max) || max < 1) return [];
  const done = new Set(completedWeeks.filter((w) => Number.isFinite(w)));
  const out: number[] = [];
  for (let w = 1; w <= max; w++) {
    if (!done.has(w)) out.push(w);
  }
  return out;
}

/** Progress weeks already finished toward `targetVersion`. */
export function completedWeeksForTarget(
  stamp: NflverseActualsVersionStamp,
  targetVersion: number,
): number[] {
  if (stamp.appliedVersion >= targetVersion) {
    return stamp.completedWeeks.length
      ? stamp.completedWeeks
      : [];
  }
  if (stamp.workingTarget === targetVersion) {
    return stamp.completedWeeks;
  }
  // New target (or first run) — start fresh.
  return [];
}

export async function countEspnCategoryActuals(options?: {
  season?: number;
}): Promise<number> {
  const season = options?.season;
  return prisma.playerWeekStat.count({
    where: {
      leagueId: NFLVERSE_LEAGUE_ID,
      actualSource: "espn_category",
      ...(season != null ? { season } : {}),
    },
  });
}

export async function clearEspnCategoryActuals(options?: {
  season?: number;
}): Promise<number> {
  const season = options?.season;
  const result = await prisma.playerWeekStat.updateMany({
    where: {
      leagueId: NFLVERSE_LEAGUE_ID,
      actualSource: "espn_category",
      ...(season != null ? { season } : {}),
    },
    data: {
      actualPpr: null,
      actualSource: null,
    },
  });
  return result.count;
}

export type RunNflverseActualsRebuildOptions = {
  season: number;
  throughWeek: number;
  /** Override env resolution (tests / CLI). */
  mode?: NflverseActualsRebuildMode;
  /**
   * Soft deadline (epoch ms). Stop starting new week ingests after this so
   * the cron can finish golden checks within Vercel maxDuration.
   */
  deadlineMs?: number;
  /** Cap weeks force-reingested per invocation (default 2). */
  maxWeeksPerRun?: number;
  /** Target data version (default NFLVERSE_ACTUALS_DATA_VERSION). */
  targetVersion?: number;
};

/**
 * Idempotent rebuild step for cron / CLI.
 * - off: no-op
 * - dry-run: count + plan only (no DB writes, no ingest)
 * - apply: clear espn_category once, force-ingest pending weeks, stamp progress
 */
export async function runNflverseActualsRebuild(
  options: RunNflverseActualsRebuildOptions,
): Promise<NflverseActualsRebuildResult> {
  const mode = options.mode ?? resolveNflverseActualsRebuildMode();
  const targetVersion = options.targetVersion ?? NFLVERSE_ACTUALS_DATA_VERSION;
  const throughWeek = Math.max(0, Math.floor(options.throughWeek));
  const maxWeeks = Math.max(1, options.maxWeeksPerRun ?? 2);
  const summary = emptySummary();

  const stamp = await loadNflverseActualsVersionStamp({
    season: options.season,
  });
  const appliedBefore = stamp.appliedVersion;
  const completedForTarget = completedWeeksForTarget(stamp, targetVersion);
  const pending = weeksNeedingForcedRebuild(throughWeek, completedForTarget);

  if (mode === "off") {
    return {
      mode,
      season: options.season,
      throughWeek,
      targetVersion,
      appliedVersionBefore: appliedBefore,
      appliedVersionAfter: appliedBefore,
      skipped: true,
      skipReason: "mode_off",
      complete: appliedBefore >= targetVersion && pending.length === 0,
      summary,
    };
  }

  if (appliedBefore >= targetVersion && pending.length === 0) {
    return {
      mode,
      season: options.season,
      throughWeek,
      targetVersion,
      appliedVersionBefore: appliedBefore,
      appliedVersionAfter: stamp.appliedVersion,
      skipped: true,
      skipReason: "already_at_version",
      complete: true,
      summary,
    };
  }

  summary.espnCategoryRowsFound = await countEspnCategoryActuals({
    season: options.season,
  });
  summary.weeksPlanned = pending.slice(0, maxWeeks);
  summary.weeksRemaining = pending.slice(maxWeeks);

  if (mode === "dry-run") {
    summary.weeksPlanned = pending;
    summary.weeksRemaining = pending;
    console.info(
      "[nflverse-actuals-rebuild] dry-run",
      JSON.stringify({
        season: options.season,
        throughWeek,
        targetVersion,
        appliedVersion: appliedBefore,
        espnCategoryRowsFound: summary.espnCategoryRowsFound,
        weeksWouldIngest: pending,
      }),
    );
    return {
      mode,
      season: options.season,
      throughWeek,
      targetVersion,
      appliedVersionBefore: appliedBefore,
      appliedVersionAfter: appliedBefore,
      skipped: false,
      skipReason: null,
      complete: false,
      summary,
    };
  }

  // apply mode — clear polluted ESPN actuals once per rebuild target
  if (summary.espnCategoryRowsFound > 0) {
    summary.espnCategoryRowsCleared = await clearEspnCategoryActuals({
      season: options.season,
    });
  }

  const completed = [...completedForTarget];
  const toRun = pending.slice(0, maxWeeks);

  for (const week of toRun) {
    if (options.deadlineMs != null && Date.now() >= options.deadlineMs) {
      break;
    }
    try {
      const result = await ingestNflverseUsage({
        season: options.season,
        week,
        includeSnaps: true,
        mergeIntoLeagueRows: true,
      });
      summary.weekStatsUpserted += result.weekStatsUpserted;
      if (result.weekStatsUpserted < 1 && result.mappedRows < 1) {
        summary.errors.push({
          week,
          error: `nflverse ingest returned no rows for week ${week}.`,
        });
      } else {
        summary.weeksIngested.push(week);
        if (!completed.includes(week)) completed.push(week);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push({ week, error: message });
    }
  }

  summary.weeksRemaining = weeksNeedingForcedRebuild(throughWeek, completed);
  const complete = throughWeek >= 1 && summary.weeksRemaining.length === 0;
  const appliedAfter = complete
    ? targetVersion
    : Math.min(appliedBefore, targetVersion - 1);

  await persistStamp(options.season, {
    kind: "nflverse_actuals_version",
    appliedVersion: appliedAfter,
    workingTarget: targetVersion,
    completedWeeks: complete
      ? Array.from({ length: throughWeek }, (_, i) => i + 1)
      : completed,
    throughWeek,
    lastRunAt: new Date().toISOString(),
    lastMode: mode,
    lastSummary: summary,
  });

  console.info(
    "[nflverse-actuals-rebuild] apply",
    JSON.stringify({
      season: options.season,
      throughWeek,
      targetVersion,
      weeksIngested: summary.weeksIngested,
      weeksRemaining: summary.weeksRemaining,
      espnCategoryRowsCleared: summary.espnCategoryRowsCleared,
      complete,
    }),
  );

  return {
    mode,
    season: options.season,
    throughWeek,
    targetVersion,
    appliedVersionBefore: appliedBefore,
    appliedVersionAfter: appliedAfter,
    skipped: false,
    skipReason: null,
    complete,
    summary,
  };
}
