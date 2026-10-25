/**
 * Read-only nflverse / golden freshness summary for /api/health/data-freshness.
 * No secrets, no user/league payloads — safe to expose publicly.
 */

import {
  loadLatestGoldenCheckResult,
  type GoldenCheckResult,
} from "@/lib/accuracy/golden-check";
import { defaultEspnSeason } from "@/lib/season";
import {
  loadNflverseSyncRuns,
  type NflverseSyncRunRecord,
} from "@/lib/nflverse/sync-log";
import {
  assessWeekCompleteness,
  loadLatestWeekInDb,
} from "@/lib/nflverse/week-completeness";
import { fetchNflWeekSnapshot } from "@/lib/players/week";
import { prisma } from "@/lib/db";
import { SYSTEM_DATA_ISSUE_KINDS } from "@/lib/accuracy/data-issues";

export type DataFreshnessResponse = {
  ok: boolean;
  season: number;
  checkedAt: string;
  summary: {
    latestWeekInDb: number | null;
    latestWeekUpdatedAt: string | null;
    latestWeekRowCount: number;
    latestCompletedWeekEspn: number | null;
    weekComplete: boolean | null;
    missingTeams: string[] | null;
    stale: boolean;
    lastGoldenCheckOk: boolean | null;
    lastGoldenCheckedAt: string | null;
    openFreshnessIssues: string[];
  };
  /** Newest-first nflverse cron runs (capped). */
  recentRuns: NflverseSyncRunRecord[];
  lastGoldenCheck: Pick<
    GoldenCheckResult,
    "ok" | "mode" | "season" | "checkedAt" | "failureCount" | "playersChecked"
  > | null;
};

export async function buildDataFreshnessReport(options?: {
  season?: number;
  runLimit?: number;
}): Promise<DataFreshnessResponse> {
  const season = options?.season ?? defaultEspnSeason();
  const checkedAt = new Date().toISOString();

  const [dbWeek, runs, golden, openIssues] = await Promise.all([
    loadLatestWeekInDb(season),
    loadNflverseSyncRuns({ season, limit: options?.runLimit ?? 10 }),
    loadLatestGoldenCheckResult(season).catch(() => null),
    prisma.dataIssue.findMany({
      where: {
        resolved: false,
        kind: { in: [...SYSTEM_DATA_ISSUE_KINDS] },
        season,
      },
      select: { kind: true },
      take: 20,
    }),
  ]);

  let latestCompletedWeekEspn: number | null = null;
  try {
    const snap = await fetchNflWeekSnapshot(season);
    latestCompletedWeekEspn = snap.latestCompletedWeek;
  } catch {
    latestCompletedWeekEspn = null;
  }

  const weekToAssess =
    dbWeek.latestWeek ??
    (latestCompletedWeekEspn != null && latestCompletedWeekEspn > 0
      ? latestCompletedWeekEspn
      : null);

  let weekComplete: boolean | null = null;
  let missingTeams: string[] | null = null;
  let stale =
    latestCompletedWeekEspn != null &&
    latestCompletedWeekEspn > 0 &&
    (dbWeek.latestWeek == null || dbWeek.latestWeek < latestCompletedWeekEspn);

  if (weekToAssess != null) {
    try {
      const completeness = await assessWeekCompleteness({
        season,
        week: weekToAssess,
      });
      weekComplete = completeness.weekComplete;
      missingTeams =
        completeness.missingTeams.length > 0
          ? completeness.missingTeams
          : completeness.weekComplete === true
            ? []
            : null;
      stale = completeness.stale || stale;
    } catch {
      // Leave completeness unknown.
    }
  }

  // Prefer the latest run's recorded golden flag when present.
  let lastGoldenCheckOk: boolean | null = golden?.ok ?? null;
  if (runs[0]?.goldenCheckOk != null) {
    lastGoldenCheckOk = runs[0].goldenCheckOk;
  }

  return {
    ok: !stale && weekComplete !== false && lastGoldenCheckOk !== false,
    season,
    checkedAt,
    summary: {
      latestWeekInDb: dbWeek.latestWeek,
      latestWeekUpdatedAt: dbWeek.updatedAt,
      latestWeekRowCount: dbWeek.rowCount,
      latestCompletedWeekEspn,
      weekComplete,
      missingTeams,
      stale,
      lastGoldenCheckOk,
      lastGoldenCheckedAt: golden?.checkedAt ?? runs[0]?.runAt ?? null,
      openFreshnessIssues: [...new Set(openIssues.map((i) => i.kind))],
    },
    recentRuns: runs,
    lastGoldenCheck: golden
      ? {
          ok: golden.ok,
          mode: golden.mode,
          season: golden.season,
          checkedAt: golden.checkedAt,
          failureCount: golden.failureCount,
          playersChecked: golden.playersChecked,
        }
      : null,
  };
}
