/**
 * Backfill nflverse completed-week stats for every week 1..throughWeek that
 * is missing solid coverage. Used by the no-league pool and the usage cron
 * so weeks before the cron existed (e.g. W1–W4) are not left empty (#126).
 *
 * Kept as a separate helper so cron route changes stay minimal / isolatable
 * from draft PR #119 (cron freshness logging).
 */

import { prisma } from "@/lib/db";
import {
  detectLatestNflverseWeek,
  ingestNflverseUsage,
  type IngestNflverseUsageResult,
} from "@/lib/nflverse/ingest";
import { NFLVERSE_LEAGUE_ID, NFLVERSE_SOURCE } from "@/lib/nflverse/map";

/** Rows with nflverse evidence required before a week counts as covered. */
export const NFLVERSE_WEEK_MIN_COVERAGE = 25;

export async function nflverseWeekCoverageCount(
  season: number,
  week: number,
): Promise<number> {
  if (week < 1) return 0;
  return prisma.playerWeekStat.count({
    where: {
      season,
      week,
      leagueId: NFLVERSE_LEAGUE_ID,
      OR: [
        { actualSource: "nflverse_ppr" },
        { source: NFLVERSE_SOURCE },
      ],
    },
  });
}

/** Pure helper — which weeks in 1..throughWeek still need ingest. */
export function weeksNeedingBackfill(
  throughWeek: number,
  coverageByWeek: Map<number, number>,
  minCoverage = NFLVERSE_WEEK_MIN_COVERAGE,
): number[] {
  const out: number[] = [];
  const max = Math.floor(throughWeek);
  if (!Number.isFinite(max) || max < 1) return out;
  for (let w = 1; w <= max; w++) {
    const count = coverageByWeek.get(w) ?? 0;
    if (count < minCoverage) out.push(w);
  }
  return out;
}

export type BackfillMissingNflverseWeeksOptions = {
  season: number;
  throughWeek: number;
  includeSnaps?: boolean;
  mergeIntoLeagueRows?: boolean;
  minCoverage?: number;
};

export type BackfillMissingNflverseWeeksResult = {
  season: number;
  throughWeek: number;
  weeksChecked: number[];
  weeksIngested: number[];
  weeksSkipped: number[];
  errors: Array<{ week: number; error: string }>;
  lastResult: IngestNflverseUsageResult | null;
  /** Sum of weekStatsUpserted across ingested weeks. */
  weekStatsUpserted: number;
  mappedRows: number;
};

/**
 * Ingest every week in 1..throughWeek that lacks nflverse coverage.
 * Caps throughWeek at detectLatestNflverseWeek when the season file lags.
 */
export async function backfillMissingNflverseWeeks(
  options: BackfillMissingNflverseWeeksOptions,
): Promise<BackfillMissingNflverseWeeksResult> {
  const minCoverage = options.minCoverage ?? NFLVERSE_WEEK_MIN_COVERAGE;
  const latestAvailable = await detectLatestNflverseWeek(options.season).catch(
    () => options.throughWeek,
  );
  const throughWeek = Math.min(
    Math.max(0, Math.floor(options.throughWeek)),
    latestAvailable,
  );

  const weeksChecked: number[] = [];
  for (let w = 1; w <= throughWeek; w++) weeksChecked.push(w);

  const coverageByWeek = new Map<number, number>();
  await Promise.all(
    weeksChecked.map(async (w) => {
      coverageByWeek.set(w, await nflverseWeekCoverageCount(options.season, w));
    }),
  );

  const need = weeksNeedingBackfill(throughWeek, coverageByWeek, minCoverage);
  const weeksSkipped = weeksChecked.filter((w) => !need.includes(w));
  const weeksIngested: number[] = [];
  const errors: Array<{ week: number; error: string }> = [];
  let lastResult: IngestNflverseUsageResult | null = null;
  let weekStatsUpserted = 0;
  let mappedRows = 0;

  for (const week of need) {
    try {
      const result = await ingestNflverseUsage({
        season: options.season,
        week,
        includeSnaps: options.includeSnaps ?? true,
        mergeIntoLeagueRows: options.mergeIntoLeagueRows ?? true,
      });
      lastResult = result;
      weekStatsUpserted += result.weekStatsUpserted;
      mappedRows += result.mappedRows;
      if (result.weekStatsUpserted < 1 && result.mappedRows < 1) {
        errors.push({
          week,
          error: `nflverse ingest returned no rows for week ${week}.`,
        });
      } else {
        weeksIngested.push(week);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ week, error: message });
    }
  }

  return {
    season: options.season,
    throughWeek,
    weeksChecked,
    weeksIngested,
    weeksSkipped,
    errors,
    lastResult,
    weekStatsUpserted,
    mappedRows,
  };
}
