/**
 * nflverse → PlayerWeekStat usage ingest (league-agnostic rows).
 *
 * Merge policy (v1):
 * - Upsert on (espnId, season, week, leagueId="")
 * - Fill usage columns + opponent only
 * - Never clobber projectedPpr / actualPpr (ESPN sync owns league-scoped PPR)
 * - source = "nflverse" on these leagueId="" rows
 * - Unmapped GSIS → skip + count (never invent ESPN ids)
 */

import { prisma } from "@/lib/db";
import { loadPlayerCrosswalk, type PlayerCrosswalk } from "./crosswalk";
import { fetchCsv } from "./csv";
import {
  mapWeekStats,
  NFLVERSE_LEAGUE_ID,
  NFLVERSE_SOURCE,
  type MappedUsage,
} from "./map-week-stats";
import {
  snapCountsCsvUrl,
  statsPlayerWeekCsvGzUrl,
  statsPlayerWeekCsvUrl,
} from "./urls";

export type IngestWeekResult = {
  season: number;
  week: number;
  fetchedRows: number;
  mappedUsage: number;
  upserted: number;
  skippedUnmapped: number;
  crosswalkSize: number;
  crosswalkUnmappedGsis: number;
  playersTouched: number;
};

const BATCH = 40;

async function loadWeekStatRows(season: number) {
  try {
    return await fetchCsv(statsPlayerWeekCsvGzUrl(season));
  } catch (gzErr) {
    console.warn(
      "[nflverse] csv.gz failed, falling back to csv",
      gzErr instanceof Error ? gzErr.message : gzErr,
    );
    return fetchCsv(statsPlayerWeekCsvUrl(season));
  }
}

async function loadSnapRows(season: number) {
  try {
    return await fetchCsv(snapCountsCsvUrl(season));
  } catch (err) {
    console.warn(
      "[nflverse] snap_counts unavailable; snapShare will stay null",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function upsertPlayerFromCrosswalk(
  crosswalk: PlayerCrosswalk,
  usage: MappedUsage,
): Promise<string | null> {
  const id = crosswalk.byGsis.get(usage.gsisId);
  if (!id) return null;

  const name = usage.playerName || id.name || `ESPN ${id.espnId}`;
  const position = usage.position || id.position || "UNK";
  const nflTeam = usage.nflTeam ?? id.nflTeam ?? null;

  const player = await prisma.player.upsert({
    where: { espnId: id.espnId },
    create: {
      espnId: id.espnId,
      espnPlayerId: String(id.espnId),
      gsisId: id.gsisId,
      sleeperId: id.sleeperId,
      name,
      position,
      nflTeam,
    },
    update: {
      espnPlayerId: String(id.espnId),
      gsisId: id.gsisId,
      ...(id.sleeperId ? { sleeperId: id.sleeperId } : {}),
      name,
      position,
      nflTeam,
    },
  });
  return player.id;
}

async function upsertUsageRow(
  playerId: string,
  espnId: number,
  usage: MappedUsage,
): Promise<void> {
  const usageFields = {
    playerId,
    playerName: usage.playerName,
    position: usage.position,
    nflTeam: usage.nflTeam,
    opponent: usage.opponent,
    targets: usage.targets,
    receptions: usage.receptions,
    carries: usage.carries,
    rushingAttempts: usage.rushingAttempts,
    rushingYards: usage.rushingYards,
    receivingYards: usage.receivingYards,
    airYards: usage.airYards,
    targetShare: usage.targetShare,
    rushShare: usage.rushShare,
    snapShare: usage.snapShare,
    // Honesty: leave RZ / route null — weekly file has no columns for them
    redZoneTargets: usage.redZoneTargets,
    redZoneTouches: usage.redZoneTouches,
    goalLineCarries: usage.goalLineCarries,
    routePct: usage.routePct,
    source: NFLVERSE_SOURCE,
  };

  await prisma.playerWeekStat.upsert({
    where: {
      espnId_season_week_leagueId: {
        espnId,
        season: usage.season,
        week: usage.week,
        leagueId: NFLVERSE_LEAGUE_ID,
      },
    },
    create: {
      espnId,
      season: usage.season,
      week: usage.week,
      leagueId: NFLVERSE_LEAGUE_ID,
      scoringFormat: "PPR",
      // PPR left null — ESPN sync owns projectedPpr/actualPpr on league-scoped rows
      projectedPpr: null,
      actualPpr: null,
      projectionDelta: null,
      projectionSource: null,
      actualSource: null,
      ...usageFields,
    },
    update: {
      // Usage-only update — never touch projectedPpr / actualPpr / projection*
      ...usageFields,
    },
  });
}

/**
 * Ingest one season/week of nflverse usage into PlayerWeekStat (leagueId="").
 */
export async function ingestNflverseWeek(opts: {
  season: number;
  week: number;
  crosswalk?: PlayerCrosswalk;
}): Promise<IngestWeekResult> {
  const { season, week } = opts;
  if (!Number.isInteger(season) || season < 1999 || season > 2100) {
    throw new Error(`Invalid season: ${season}`);
  }
  if (!Number.isInteger(week) || week < 1 || week > 22) {
    throw new Error(`Invalid week: ${week}`);
  }

  const crosswalk = opts.crosswalk ?? (await loadPlayerCrosswalk());
  const [statRows, snapRows] = await Promise.all([
    loadWeekStatRows(season),
    loadSnapRows(season),
  ]);

  const pfrIdByGsis = new Map<string, string | null>();
  for (const entry of crosswalk.byGsis.values()) {
    pfrIdByGsis.set(entry.gsisId, entry.pfrId);
  }

  const mapped = mapWeekStats(statRows, week, { snapRows, pfrIdByGsis });

  let upserted = 0;
  let skippedUnmapped = 0;
  let playersTouched = 0;

  for (let i = 0; i < mapped.length; i += BATCH) {
    const chunk = mapped.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (usage) => {
        const entry = crosswalk.byGsis.get(usage.gsisId);
        if (!entry) {
          skippedUnmapped += 1;
          return;
        }
        try {
          const playerId = await upsertPlayerFromCrosswalk(crosswalk, usage);
          if (!playerId) {
            skippedUnmapped += 1;
            return;
          }
          playersTouched += 1;
          await upsertUsageRow(playerId, entry.espnId, usage);
          upserted += 1;
        } catch (err) {
          // Unique gsisId conflict if espn ids diverge — log and skip (honesty)
          console.warn(
            "[nflverse] upsert skipped",
            usage.gsisId,
            err instanceof Error ? err.message : err,
          );
          skippedUnmapped += 1;
        }
      }),
    );
  }

  return {
    season,
    week,
    fetchedRows: statRows.length,
    mappedUsage: mapped.length,
    upserted,
    skippedUnmapped,
    crosswalkSize: crosswalk.byGsis.size,
    crosswalkUnmappedGsis: crosswalk.unmappedGsisCount,
    playersTouched,
  };
}

/** Discover max REG week present in the season file (for cron default). */
export async function latestCompletedWeek(season: number): Promise<number | null> {
  const rows = await loadWeekStatRows(season);
  let max = 0;
  for (const row of rows) {
    const st = (row.season_type || row.game_type || "REG").trim();
    if (st !== "REG") continue;
    const w = Number(row.week);
    if (Number.isFinite(w) && w > max) max = w;
  }
  return max > 0 ? max : null;
}
