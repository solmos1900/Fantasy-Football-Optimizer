/**
 * Server-only: serve the no-league player pool from a stored snapshot.
 * Kept out of pool.ts because client components import pool.ts helpers and
 * `after()` is server-only.
 */

import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { defaultEspnSeason } from "@/lib/season";
import {
  buildNoLeaguePlayerPool,
  type PlayerPoolBundle,
} from "@/lib/players/pool";
import { loadToolDisplayMeta } from "@/lib/insights/tool-display";
import { buildTradeTeammateInjuryIndex } from "@/lib/insights/build-trade-injury-index";

// ── Snapshot serving ──────────────────────────────────────────────────────
// Pages and chat read one stored row. When it is older than the TTL the
// request still gets the stored copy immediately and a single background
// rebuild runs after the response (lease on refreshStartedAt). A cron can
// also call refreshPlayerPoolSnapshot() directly.

/** Snapshot age that triggers a background rebuild. */
export const POOL_SNAPSHOT_TTL_MS = 10 * 60 * 1000;
/** A rebuild that has not finished within this window is assumed dead. */
const POOL_REFRESH_LEASE_MS = 5 * 60 * 1000;

export function poolSnapshotKey(season: number): string {
  return `nfl-pool:${season}`;
}

type StoredPool = Omit<PlayerPoolBundle, "trends">;

export function poolSnapshotIsStale(
  builtAt: Date,
  now = Date.now(),
): boolean {
  return now - builtAt.getTime() > POOL_SNAPSHOT_TTL_MS;
}

/**
 * Claim the rebuild lease. Returns false when another rebuild started
 * within POOL_REFRESH_LEASE_MS (or the row does not exist yet).
 */
async function claimPoolRefreshLease(key: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - POOL_REFRESH_LEASE_MS);
  const claimed = await prisma.playerPoolSnapshot.updateMany({
    where: {
      key,
      OR: [{ refreshStartedAt: null }, { refreshStartedAt: { lt: cutoff } }],
    },
    data: { refreshStartedAt: new Date() },
  });
  return claimed.count > 0;
}

/**
 * Rebuild and store the snapshot. A degraded build (scoreboard down) never
 * overwrites an existing snapshot — the lease simply expires and the next
 * stale read retries.
 */
export async function refreshPlayerPoolSnapshot(options?: {
  forceRefresh?: boolean;
}): Promise<{ stored: boolean; bundle: PlayerPoolBundle }> {
  return storePoolSnapshot(await buildNoLeaguePlayerPool(options));
}

async function storePoolSnapshot(
  built: PlayerPoolBundle & { degraded: boolean },
): Promise<{ stored: boolean; bundle: PlayerPoolBundle }> {
  const { degraded, ...bundle } = built;
  const key = poolSnapshotKey(bundle.freshness.season);
  const existing = await prisma.playerPoolSnapshot.findUnique({
    where: { key },
    select: { key: true },
  });
  if (degraded && existing) {
    return { stored: false, bundle };
  }
  // Precompute the Trades / Who to Start display inputs once per rebuild so
  // page and chat requests read them instead of refetching per request.
  const [toolMeta, teammateInjury] = await Promise.all([
    loadToolDisplayMeta({
      season: bundle.freshness.season,
      players: bundle.players,
    }).catch((err) => {
      console.error("[pool] tool meta precompute failed", err);
      return undefined;
    }),
    buildTradeTeammateInjuryIndex(bundle.players, bundle.freshness.season).catch(
      (err) => {
        console.error("[pool] teammate injury precompute failed", err);
        return undefined;
      },
    ),
  ]);
  const stored: StoredPool = {
    players: bundle.players,
    freshness: bundle.freshness,
    contextLeague: bundle.contextLeague,
    ...(toolMeta ? { toolMeta } : {}),
    ...(teammateInjury ? { teammateInjury } : {}),
  };
  const payload = stored as unknown as Prisma.InputJsonValue;
  const builtAt = new Date();
  await prisma.playerPoolSnapshot.upsert({
    where: { key },
    create: { key, payload, builtAt },
    update: { payload, builtAt, refreshStartedAt: null },
  });
  return { stored: true, bundle: { ...stored, trends: {} } };
}

function scheduleInBackground(task: () => Promise<unknown>): void {
  const run = () =>
    task().catch((err) => {
      console.error("[pool] background snapshot refresh failed", err);
    });
  try {
    // Runs after the response is sent (Next request scope).
    after(run);
  } catch {
    // Outside a request (scripts / tests): run detached.
    void run();
  }
}

/**
 * No-league player pool for pages, tools and chat. Serves the stored
 * snapshot; only builds inline on a cold database (no snapshot yet) or when
 * forceRefresh is set (scripts).
 */
export async function getNoLeaguePlayerPool(options?: {
  forceRefresh?: boolean;
}): Promise<PlayerPoolBundle> {
  const season = defaultEspnSeason();
  const key = poolSnapshotKey(season);

  if (!options?.forceRefresh) {
    let row: { payload: Prisma.JsonValue; builtAt: Date } | null = null;
    try {
      row = await prisma.playerPoolSnapshot.findUnique({
        where: { key },
        select: { payload: true, builtAt: true },
      });
    } catch (err) {
      console.error("[pool] snapshot read failed; building inline", err);
    }
    if (row) {
      if (poolSnapshotIsStale(row.builtAt)) {
        scheduleInBackground(async () => {
          if (await claimPoolRefreshLease(key)) {
            await refreshPlayerPoolSnapshot();
          }
        });
      }
      const stored = row.payload as unknown as StoredPool;
      return { ...stored, trends: {} };
    }
  }

  const built = await buildNoLeaguePlayerPool(options);
  try {
    return (await storePoolSnapshot(built)).bundle;
  } catch (err) {
    // Snapshot write failed (e.g. migration not applied) — still serve data.
    console.error("[pool] snapshot store failed; serving inline build", err);
    const { degraded: _degraded, ...bundle } = built;
    void _degraded;
    return bundle;
  }
}
