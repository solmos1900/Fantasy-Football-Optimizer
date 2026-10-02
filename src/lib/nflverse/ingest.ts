/**
 * nflverse → PlayerWeekStat usage ingest (league-agnostic, leagueId = "").
 *
 * - Fetches official nflverse-data release CSVs over HTTPS (Node/TS only)
 * - Crosswalks GSIS → ESPN via players.csv
 * - Upserts Player.gsisId and PlayerWeekStat usage columns in batches
 * - Never writes projectedPpr / actualPpr (ESPN sync owns those)
 * - Null beats fake: only real nflverse fields
 */

import { prisma } from "@/lib/db";
import { fetchGunzipText, parseCsv } from "./csv";
import { loadPlayerIdCrosswalk } from "./crosswalk";
import {
  mapNflverseWeekRow,
  mapSnapPct,
  mergeNullUsageOnly,
  NFLVERSE_LEAGUE_ID,
  NFLVERSE_SOURCE,
  usageFieldsForWrite,
  type NflverseUsageMapped,
} from "./map";
import { playerWeekStatsCsvGzUrl, snapCountsCsvGzUrl } from "./urls";

export type IngestNflverseUsageOptions = {
  season: number;
  /** When set, only that NFL week. Cron should pass one week per run. */
  week?: number;
  /** Also fill null usage cols on league-scoped ESPN rows for the same espn/week. */
  mergeIntoLeagueRows?: boolean;
  /** Upsert chunk size */
  batchSize?: number;
  /** Include snap_counts join (best-effort by name+team+week). */
  includeSnaps?: boolean;
};

export type IngestNflverseUsageResult = {
  season: number;
  week: number | null;
  fetchedRows: number;
  mappedRows: number;
  skippedNoEspnId: number;
  playersUpserted: number;
  weekStatsUpserted: number;
  leagueRowsMerged: number;
  source: typeof NFLVERSE_SOURCE;
};

const DEFAULT_BATCH = 75;

function snapKey(name: string, team: string, week: number): string {
  return `${name.trim().toLowerCase()}|${team.trim().toUpperCase()}|${week}`;
}

async function loadSnapIndex(
  season: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const text = await fetchGunzipText(snapCountsCsvGzUrl(season));
    for (const row of parseCsv(text)) {
      const week = Number(row.week);
      if (!Number.isFinite(week)) continue;
      const name = (row.player ?? "").trim();
      const team = (row.team ?? "").trim();
      if (!name || !team) continue;
      const pct = mapSnapPct(row.offense_pct);
      if (pct == null) continue;
      out.set(snapKey(name, team, week), pct);
    }
  } catch (err) {
    console.warn("[nflverse] snap_counts unavailable; continuing without snaps", err);
  }
  return out;
}

async function upsertPlayerBatch(
  rows: Array<{
    espnId: number;
    gsisId: string;
    name: string;
    position: string;
    nflTeam: string | null;
  }>,
): Promise<number> {
  let n = 0;
  for (const row of rows) {
    await prisma.player.upsert({
      where: { espnId: row.espnId },
      create: {
        espnId: row.espnId,
        espnPlayerId: String(row.espnId),
        gsisId: row.gsisId,
        name: row.name,
        position: row.position,
        nflTeam: row.nflTeam,
      },
      update: {
        gsisId: row.gsisId,
        espnPlayerId: String(row.espnId),
        name: row.name,
        position: row.position,
        ...(row.nflTeam ? { nflTeam: row.nflTeam } : {}),
      },
    });
    n += 1;
  }
  return n;
}

async function upsertUsageBatch(
  items: Array<{ espnId: number; playerId: string | null; mapped: NflverseUsageMapped }>,
): Promise<number> {
  let n = 0;
  for (const { espnId, playerId, mapped } of items) {
    const usage = usageFieldsForWrite(mapped);
    // Core week-stat fields always refresh; snapShare only when the optional
    // snap_counts join succeeded (never wipe a prior snap with null).
    const updateUsage: Record<string, number | null> = {
      targets: usage.targets,
      receptions: usage.receptions,
      carries: usage.carries,
      rushingAttempts: usage.rushingAttempts,
      rushingYards: usage.rushingYards,
      receivingYards: usage.receivingYards,
      targetShare: usage.targetShare,
      airYards: usage.airYards,
    };
    if (usage.snapShare != null) {
      updateUsage.snapShare = usage.snapShare;
    }
    await prisma.playerWeekStat.upsert({
      where: {
        espnId_season_week_leagueId: {
          espnId,
          season: mapped.season,
          week: mapped.week,
          leagueId: NFLVERSE_LEAGUE_ID,
        },
      },
      create: {
        playerId: playerId ?? undefined,
        espnId,
        playerName: mapped.playerName,
        position: mapped.position,
        nflTeam: mapped.nflTeam,
        season: mapped.season,
        week: mapped.week,
        scoringFormat: "PPR",
        // PPR left null — ESPN sync owns league scoring
        projectedPpr: null,
        actualPpr: null,
        projectionDelta: null,
        projectionSource: null,
        actualSource: null,
        opponent: mapped.opponent,
        source: NFLVERSE_SOURCE,
        leagueId: NFLVERSE_LEAGUE_ID,
        ...usage,
      },
      update: {
        playerId: playerId ?? undefined,
        playerName: mapped.playerName,
        position: mapped.position,
        nflTeam: mapped.nflTeam,
        opponent: mapped.opponent,
        source: NFLVERSE_SOURCE,
        ...updateUsage,
        // Never clobber PPR on update either
      },
    });
    n += 1;
  }
  return n;
}

async function mergeLeagueScopedNullUsage(
  espnId: number,
  mapped: NflverseUsageMapped,
): Promise<number> {
  const existing = await prisma.playerWeekStat.findMany({
    where: {
      espnId,
      season: mapped.season,
      week: mapped.week,
      NOT: { leagueId: NFLVERSE_LEAGUE_ID },
    },
  });
  let merged = 0;
  for (const row of existing) {
    const patch = mergeNullUsageOnly(row, mapped);
    if (Object.keys(patch).length === 0) continue;
    await prisma.playerWeekStat.update({
      where: { id: row.id },
      data: patch,
    });
    merged += 1;
  }
  return merged;
}

export async function ingestNflverseUsage(
  opts: IngestNflverseUsageOptions,
): Promise<IngestNflverseUsageResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH;
  const includeSnaps = opts.includeSnaps !== false;
  const mergeIntoLeagueRows = opts.mergeIntoLeagueRows !== false;

  const [crosswalk, weekCsv, snapIndex] = await Promise.all([
    loadPlayerIdCrosswalk(),
    fetchGunzipText(playerWeekStatsCsvGzUrl(opts.season)),
    includeSnaps ? loadSnapIndex(opts.season) : Promise.resolve(new Map()),
  ]);

  const rawRows = parseCsv(weekCsv);
  const mapped: Array<{ espnId: number; mapped: NflverseUsageMapped }> = [];
  let skippedNoEspnId = 0;

  for (const row of rawRows) {
    const m = mapNflverseWeekRow(row, { week: opts.week });
    if (!m) continue;
    if (opts.week != null && m.week !== opts.week) continue;

    const espnId = crosswalk.gsisToEspn.get(m.gsisId);
    if (espnId == null) {
      skippedNoEspnId += 1;
      continue;
    }

    if (m.snapShare == null && m.nflTeam && snapIndex.size > 0) {
      const snap =
        snapIndex.get(snapKey(m.playerName, m.nflTeam, m.week)) ?? null;
      if (snap != null) m.snapShare = snap;
    }

    const meta = crosswalk.meta.get(m.gsisId);
    if (meta) {
      if (!m.playerName) m.playerName = meta.name;
      if (m.position === "UNK" && meta.position) m.position = meta.position;
      if (!m.nflTeam && meta.nflTeam) m.nflTeam = meta.nflTeam;
    }

    mapped.push({ espnId, mapped: m });
  }

  let playersUpserted = 0;
  let weekStatsUpserted = 0;
  let leagueRowsMerged = 0;

  // Dedupe by espnId+week (last wins)
  const byKey = new Map<string, { espnId: number; mapped: NflverseUsageMapped }>();
  for (const item of mapped) {
    byKey.set(`${item.espnId}:${item.mapped.week}`, item);
  }
  const unique = [...byKey.values()];

  for (let i = 0; i < unique.length; i += batchSize) {
    const chunk = unique.slice(i, i + batchSize);

    playersUpserted += await upsertPlayerBatch(
      chunk.map(({ espnId, mapped: m }) => ({
        espnId,
        gsisId: m.gsisId,
        name: m.playerName,
        position: m.position,
        nflTeam: m.nflTeam,
      })),
    );

    const espnIds = chunk.map((c) => c.espnId);
    const players = await prisma.player.findMany({
      where: { espnId: { in: espnIds } },
      select: { id: true, espnId: true },
    });
    const idByEspn = new Map(players.map((p) => [p.espnId, p.id]));

    weekStatsUpserted += await upsertUsageBatch(
      chunk.map(({ espnId, mapped: m }) => ({
        espnId,
        playerId: idByEspn.get(espnId) ?? null,
        mapped: m,
      })),
    );

    if (mergeIntoLeagueRows) {
      for (const { espnId, mapped: m } of chunk) {
        leagueRowsMerged += await mergeLeagueScopedNullUsage(espnId, m);
      }
    }
  }

  return {
    season: opts.season,
    week: opts.week ?? null,
    fetchedRows: rawRows.length,
    mappedRows: unique.length,
    skippedNoEspnId,
    playersUpserted,
    weekStatsUpserted,
    leagueRowsMerged,
    source: NFLVERSE_SOURCE,
  };
}

/**
 * Pick the latest REG week present in the season file (for cron auto mode).
 */
export async function detectLatestNflverseWeek(season: number): Promise<number> {
  const text = await fetchGunzipText(playerWeekStatsCsvGzUrl(season));
  let max = 0;
  for (const row of parseCsv(text)) {
    if ((row.season_type ?? "").toUpperCase() !== "REG") continue;
    const w = Number(row.week);
    if (Number.isFinite(w) && w > max) max = w;
  }
  if (max < 1) {
    throw new Error(`No REG weeks found in nflverse stats for season ${season}`);
  }
  return max;
}
