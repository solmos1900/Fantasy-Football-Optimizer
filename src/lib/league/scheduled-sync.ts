/**
 * Scheduled league refresh (rosters, records, matchups, free agents) so users
 * see roster moves without tapping Sync. Runs from /api/cron/league-sync, which
 * vercel.json schedules twice a day.
 *
 * Each user's active league (their most recently updated connection, the one
 * the app shows) is synced when it is older than STALE_AFTER_HOURS, oldest
 * first, within a time budget. Uses the same refreshUserLeague as the Sync
 * button, so ESPN cookies are never rewritten (#105).
 */

import { prisma } from "@/lib/db";
import { refreshUserLeague } from "@/lib/league/service";
import { errorMessage } from "@/lib/ops/alert";

export const STALE_AFTER_HOURS = 6;

export type ConnectionRow = {
  userId: string;
  lastSyncedAt: Date | null;
  updatedAt: Date;
  isDemo: boolean;
};

/**
 * Users whose active league needs a refresh, oldest sync first. Only the
 * newest connection per user counts (getUserLeagueConnection), so a stale
 * old league never triggers a re-sync of a fresh active one.
 */
export function selectUsersToSync(
  rows: ConnectionRow[],
  now: Date,
  staleAfterHours = STALE_AFTER_HOURS,
): string[] {
  const active = new Map<string, ConnectionRow>();
  for (const r of rows) {
    if (r.isDemo) continue;
    const prev = active.get(r.userId);
    if (!prev || r.updatedAt > prev.updatedAt) active.set(r.userId, r);
  }
  const cutoff = now.getTime() - staleAfterHours * 60 * 60_000;
  return [...active.values()]
    .filter((r) => !r.lastSyncedAt || r.lastSyncedAt.getTime() < cutoff)
    .sort((a, b) => (a.lastSyncedAt?.getTime() ?? 0) - (b.lastSyncedAt?.getTime() ?? 0))
    .map((r) => r.userId);
}

export type ScheduledSyncResult = {
  due: number;
  synced: number;
  failed: number;
  /** Due leagues left for the next run because the time budget ran out. */
  deferred: number;
  failures: { userId: string; error: string }[];
  ms: number;
};

export async function runScheduledLeagueSync(options?: {
  now?: Date;
  /** Stop starting new syncs after this many ms (route maxDuration is 300 s). */
  budgetMs?: number;
  concurrency?: number;
}): Promise<ScheduledSyncResult> {
  const started = Date.now();
  const budgetMs = options?.budgetMs ?? 240_000;
  const concurrency = Math.max(1, options?.concurrency ?? 3);

  const rows = await prisma.leagueConnection.findMany({
    where: { isDemo: false },
    select: { userId: true, lastSyncedAt: true, updatedAt: true, isDemo: true },
  });
  const queue = selectUsersToSync(rows, options?.now ?? new Date());
  const due = queue.length;

  let synced = 0;
  const failures: { userId: string; error: string }[] = [];
  let next = 0;
  async function worker() {
    while (next < queue.length && Date.now() - started < budgetMs) {
      const userId = queue[next++]!;
      try {
        await refreshUserLeague(userId);
        synced += 1;
      } catch (err) {
        // e.g. expired ESPN cookies on a private league: the user sees the
        // usual reconnect prompt when they next tap Sync.
        failures.push({ userId, error: errorMessage(err).slice(0, 200) });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  return {
    due,
    synced,
    failed: failures.length,
    deferred: Math.max(0, due - synced - failures.length),
    failures: failures.slice(0, 20),
    ms: Date.now() - started,
  };
}
