/**
 * Version-stamped guest-pool actuals rebuild (#136).
 *
 * After #133/#134, production still held espn_category leftovers and weeks
 * stamped with the pre–fantasy_points_ppr formula. Ordinary
 * `backfillMissingNflverseWeeks` skips any week with ≥25 nflverse rows, so
 * those weeks never get rescored unless we force a re-ingest.
 *
 * Default: ENABLED on cron after deploy (Sebastian's merge = approval).
 * Kill-switch: DATA_REBUILD_DISABLED=1 (or "true"/"yes") skips apply.
 *
 * Each run logs a dry-run summary first, then applies cleanup + force
 * re-ingest for pending weeks. Progress is stamped so it runs once per
 * data version and resumes across cron invocations within maxDuration.
 */

import { prisma } from "@/lib/db";
import { ingestNflverseUsage } from "@/lib/nflverse/ingest";
import { NFLVERSE_LEAGUE_ID, NFLVERSE_SOURCE } from "@/lib/nflverse/map";
import { fetchGunzipText, parseCsv } from "@/lib/nflverse/csv";
import { playerWeekStatsCsvGzUrl } from "@/lib/nflverse/urls";
import { defaultEspnSeason } from "@/lib/season";

/** Bump when scoring/source contract changes and W1..N must be rewritten. */
export const NFLVERSE_ACTUALS_DATA_VERSION = 2;

export const NFLVERSE_REBUILD_LEAGUE_ID = "__nflverse_rebuild__";
export const NFLVERSE_REBUILD_VIEW = "nflverse_actuals_version";

/** Kill-switch env — when set, cron skips the rebuild (rollback). */
export const DATA_REBUILD_DISABLED_ENV = "DATA_REBUILD_DISABLED";

/** Probe player for before/after run log (#136). */
export const REBUILD_PROBE_MCMILLAN = {
  name: "Tetairoa McMillan",
  nflTeam: "CAR",
  week: 4,
  /** nflverse fantasy_points_ppr for 2026 W4 (14-192-2). */
  expectedActualPpr: 45.2,
} as const;

export type NflverseActualsRebuildMode = "disabled" | "apply";

export type RebuildHealthSnapshot = {
  week4NflverseRowCount: number;
  /** Tetairoa McMillan (CAR) W4 actualPpr from guest-pool rows; null if missing. */
  mcmillanW4Points: number | null;
  /**
   * Sum of pass+rush+rec 2-pt conversion *events* in nflverse REG skill rows
   * for weeks 1..throughWeek (source file). 0 when CSV unavailable.
   */
  twoPointConversionEvents: number;
  throughWeek: number;
  capturedAt: string;
};

export type NflverseActualsRebuildSummary = {
  espnCategoryRowsFound: number;
  espnCategoryRowsCleared: number;
  weeksPlanned: number[];
  weeksIngested: number[];
  weeksRemaining: number[];
  weekStatsUpserted: number;
  errors: Array<{ week: number; error: string }>;
  before: RebuildHealthSnapshot | null;
  after: RebuildHealthSnapshot | null;
  dryRunLogged: boolean;
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
    before: null,
    after: null,
    dryRunLogged: false,
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
 * Kill-switch: DATA_REBUILD_DISABLED=1 → disabled.
 * Default (unset) → apply. Merging the PR is Sebastian's approval to run.
 */
export function resolveNflverseActualsRebuildMode(
  env: Record<string, string | undefined> = process.env,
): NflverseActualsRebuildMode {
  const kill = (env[DATA_REBUILD_DISABLED_ENV] ?? "").trim().toLowerCase();
  if (
    kill === "1" ||
    kill === "true" ||
    kill === "yes" ||
    kill === "on" ||
    kill === "disabled"
  ) {
    return "disabled";
  }
  // Legacy override still honored for local dry-ops if someone sets mode=off.
  const legacy = (env.NFLVERSE_ACTUALS_REBUILD_MODE ?? "").trim().toLowerCase();
  if (
    legacy === "off" ||
    legacy === "disabled" ||
    legacy === "0" ||
    legacy === "false"
  ) {
    return "disabled";
  }
  return "apply";
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
    return stamp.completedWeeks.length ? stamp.completedWeeks : [];
  }
  if (stamp.workingTarget === targetVersion) {
    return stamp.completedWeeks;
  }
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

async function countWeek4NflverseRows(season: number): Promise<number> {
  return prisma.playerWeekStat.count({
    where: {
      season,
      week: REBUILD_PROBE_MCMILLAN.week,
      leagueId: NFLVERSE_LEAGUE_ID,
      OR: [
        { actualSource: "nflverse_ppr" },
        { source: NFLVERSE_SOURCE },
      ],
    },
  });
}

async function readMcmillanW4Points(season: number): Promise<number | null> {
  const row = await prisma.playerWeekStat.findFirst({
    where: {
      season,
      week: REBUILD_PROBE_MCMILLAN.week,
      leagueId: NFLVERSE_LEAGUE_ID,
      playerName: { equals: REBUILD_PROBE_MCMILLAN.name, mode: "insensitive" },
      OR: [
        { actualSource: "nflverse_ppr" },
        { source: NFLVERSE_SOURCE },
        { actualPpr: { not: null } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { actualPpr: true, actualSource: true },
  });
  if (!row) return null;
  // Prefer nflverse; ignore espn_category leftovers for the probe.
  if (row.actualSource === "espn_category") return null;
  if (row.actualPpr == null || !Number.isFinite(row.actualPpr)) return null;
  return Math.round(row.actualPpr * 10) / 10;
}

/**
 * Count 2-pt conversion *events* in nflverse REG skill rows for weeks 1..throughWeek.
 * Pure helper also used by the verify script on fixture CSV text.
 */
export function countTwoPointConversionEventsFromRows(
  rows: Array<Record<string, string>>,
  throughWeek: number,
): number {
  const max = Math.floor(throughWeek);
  if (!Number.isFinite(max) || max < 1) return 0;
  let total = 0;
  for (const row of rows) {
    const seasonType = (row.season_type ?? "").toUpperCase();
    if (seasonType && seasonType !== "REG") continue;
    const week = Number(row.week);
    if (!Number.isFinite(week) || week < 1 || week > max) continue;
    const pos = (row.position ?? "").toUpperCase();
    if (pos && !["QB", "RB", "WR", "TE", "FB"].includes(pos)) continue;
    for (const key of [
      "passing_2pt_conversions",
      "rushing_2pt_conversions",
      "receiving_2pt_conversions",
    ]) {
      const n = Number(row[key] ?? 0);
      if (Number.isFinite(n) && n > 0) total += n;
    }
  }
  return total;
}

/** Pure: read McMillan W4 fantasy_points_ppr from fixture/csv rows. */
export function mcmillanW4FromNflverseRows(
  rows: Array<Record<string, string>>,
): number | null {
  for (const row of rows) {
    const seasonType = (row.season_type ?? "").toUpperCase();
    if (seasonType && seasonType !== "REG") continue;
    const week = Number(row.week);
    if (week !== REBUILD_PROBE_MCMILLAN.week) continue;
    const name = (
      row.player_display_name ??
      row.player_name ??
      row.player ??
      ""
    ).trim();
    const team = (row.team ?? row.recent_team ?? "").trim().toUpperCase();
    if (
      name.toLowerCase() !== REBUILD_PROBE_MCMILLAN.name.toLowerCase() &&
      !name.toLowerCase().includes("mcmillan")
    ) {
      continue;
    }
    if (team && team !== REBUILD_PROBE_MCMILLAN.nflTeam) continue;
    const pts = Number(row.fantasy_points_ppr);
    if (!Number.isFinite(pts)) return null;
    return Math.round(pts * 10) / 10;
  }
  return null;
}

async function countTwoPointConversionEventsFromSource(
  season: number,
  throughWeek: number,
): Promise<number> {
  try {
    const text = await fetchGunzipText(playerWeekStatsCsvGzUrl(season));
    return countTwoPointConversionEventsFromRows(parseCsv(text), throughWeek);
  } catch (err) {
    console.warn(
      "[nflverse-actuals-rebuild] 2pt source count unavailable",
      err,
    );
    return 0;
  }
}

export async function collectRebuildHealthSnapshot(options: {
  season: number;
  throughWeek: number;
}): Promise<RebuildHealthSnapshot> {
  const [week4NflverseRowCount, mcmillanW4Points, twoPointConversionEvents] =
    await Promise.all([
      countWeek4NflverseRows(options.season),
      readMcmillanW4Points(options.season),
      countTwoPointConversionEventsFromSource(
        options.season,
        options.throughWeek,
      ),
    ]);
  return {
    week4NflverseRowCount,
    mcmillanW4Points,
    twoPointConversionEvents,
    throughWeek: options.throughWeek,
    capturedAt: new Date().toISOString(),
  };
}

/** Format before/after probe lines for cron logs. */
export function formatRebuildHealthLog(
  label: "before" | "after",
  snap: RebuildHealthSnapshot,
): string {
  const mcm =
    snap.mcmillanW4Points == null
      ? "missing"
      : String(snap.mcmillanW4Points);
  return [
    `[nflverse-actuals-rebuild] ${label}`,
    `week4NflverseRows=${snap.week4NflverseRowCount}`,
    `Tetairoa McMillan (CAR) W4=${mcm}`,
    `twoPointConversionEvents=${snap.twoPointConversionEvents}`,
  ].join(" ");
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
  /** Skip live CSV/DB health probes (unit tests). */
  skipHealthSnapshot?: boolean;
};

/**
 * Idempotent rebuild step for cron / CLI.
 * Default mode=apply (enabled). Kill-switch → disabled no-op.
 * Always logs a dry-run plan first, then applies when enabled.
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

  if (mode === "disabled") {
    return {
      mode,
      season: options.season,
      throughWeek,
      targetVersion,
      appliedVersionBefore: appliedBefore,
      appliedVersionAfter: appliedBefore,
      skipped: true,
      skipReason: "data_rebuild_disabled",
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

  if (!options.skipHealthSnapshot) {
    summary.before = await collectRebuildHealthSnapshot({
      season: options.season,
      throughWeek,
    });
    console.info(formatRebuildHealthLog("before", summary.before));
  }

  // Dry-run summary first (always), then apply.
  console.info(
    "[nflverse-actuals-rebuild] dry-run plan",
    JSON.stringify({
      season: options.season,
      throughWeek,
      targetVersion,
      appliedVersion: appliedBefore,
      espnCategoryRowsWouldClear: summary.espnCategoryRowsFound,
      weeksWouldIngestThisRun: summary.weeksPlanned,
      weeksWouldRemainAfter: summary.weeksRemaining,
      before: summary.before,
    }),
  );
  summary.dryRunLogged = true;

  // apply — clear polluted ESPN actuals, then force-ingest pending weeks
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

  if (!options.skipHealthSnapshot) {
    summary.after = await collectRebuildHealthSnapshot({
      season: options.season,
      throughWeek,
    });
    console.info(formatRebuildHealthLog("after", summary.after));
  }

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
    "[nflverse-actuals-rebuild] apply done",
    JSON.stringify({
      season: options.season,
      throughWeek,
      targetVersion,
      weeksIngested: summary.weeksIngested,
      weeksRemaining: summary.weeksRemaining,
      espnCategoryRowsCleared: summary.espnCategoryRowsCleared,
      complete,
      before: summary.before,
      after: summary.after,
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
