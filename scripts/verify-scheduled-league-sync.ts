/**
 * Unit guard: which leagues the twice-daily sync cron refreshes.
 * Run: npm run verify:scheduled-league-sync
 */

import assert from "node:assert/strict";
import { selectUsersToSync } from "../src/lib/league/scheduled-sync";

const now = new Date("2026-11-22T23:00:00Z");
const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);

const picked = selectUsersToSync(
  [
    { userId: "fresh", lastSyncedAt: h(2), updatedAt: h(2), isDemo: false },
    { userId: "stale12", lastSyncedAt: h(12), updatedAt: h(12), isDemo: false },
    { userId: "stale30", lastSyncedAt: h(30), updatedAt: h(30), isDemo: false },
    { userId: "never", lastSyncedAt: null, updatedAt: h(1), isDemo: false },
    { userId: "demo", lastSyncedAt: h(48), updatedAt: h(48), isDemo: true },
    // Old stale league, but the user's active (newest) league is fresh → skip.
    { userId: "switched", lastSyncedAt: h(40), updatedAt: h(40), isDemo: false },
    { userId: "switched", lastSyncedAt: h(1), updatedAt: h(1), isDemo: false },
    // Active league is stale even though an older one isn't.
    { userId: "multi", lastSyncedAt: h(1), updatedAt: h(20), isDemo: false },
    { userId: "multi", lastSyncedAt: h(9), updatedAt: h(9), isDemo: false },
  ],
  now,
);
assert.deepEqual(picked, ["never", "stale30", "stale12", "multi"], "stale active leagues, oldest first");
assert.deepEqual(selectUsersToSync([], now), []);
// Exactly at the 6 h boundary is not yet stale.
assert.deepEqual(
  selectUsersToSync([{ userId: "edge", lastSyncedAt: h(6), updatedAt: h(6), isDemo: false }], now),
  [],
);

console.log("verify:scheduled-league-sync OK");
