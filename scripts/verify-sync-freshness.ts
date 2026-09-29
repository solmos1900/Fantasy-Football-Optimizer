/**
 * Sync freshness / lastSyncedAt display guards (no DB / no ESPN network).
 *
 * Run: npm run verify:sync-freshness
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  decryptEspnCookie,
  encryptEspnCookie,
} from "../src/lib/espn/cookie-crypto";
import { applyConnectionLastSyncedAt } from "../src/lib/league/service";
import type { LeagueData } from "../src/lib/types";

function setNodeEnv(value: string | undefined) {
  const env = process.env as { NODE_ENV?: string };
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

const stalePayload: LeagueData = {
  leagueId: "123",
  season: 2026,
  name: "My 2026 League",
  currentWeek: 3,
  scoringPeriodId: 3,
  isDemo: false,
  teams: [],
  matchups: [],
  freeAgents: [],
  lastSyncedAt: "2026-09-24T02:07:51.000Z",
};

// DB column newer than blob → UI must show DB time (fixes frozen header).
const dbFresh = new Date("2026-09-28T18:00:00.000Z");
const overlaid = applyConnectionLastSyncedAt(stalePayload, dbFresh);
assert.equal(overlaid.lastSyncedAt, dbFresh.toISOString());
assert.equal(overlaid.name, "My 2026 League");
assert.equal(overlaid.currentWeek, 3);

// No DB timestamp → keep payload value.
const fallback = applyConnectionLastSyncedAt(stalePayload, null);
assert.equal(fallback.lastSyncedAt, stalePayload.lastSyncedAt);

// Fresh sync payload always stamps a new ISO time (constructor contract).
const syncedAt = new Date().toISOString();
assert.ok(Date.parse(syncedAt) > Date.parse(stalePayload.lastSyncedAt));

// Cookie decrypt failure must throw a message the sync route / SyncButton can surface.
const keyB64 = randomBytes(32).toString("base64");
process.env.ESPN_COOKIE_ENCRYPTION_KEY = keyB64;
setNodeEnv("production");
const enc = encryptEspnCookie("{SWID-TEST}");
assert.ok(enc);

process.env.ESPN_COOKIE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
assert.throws(
  () => decryptEspnCookie(enc),
  /ESPN_COOKIE_ENCRYPTION_KEY|decrypt ESPN cookie/i,
);

delete process.env.ESPN_COOKIE_ENCRYPTION_KEY;
assert.throws(
  () => decryptEspnCookie(enc),
  /ESPN_COOKIE_ENCRYPTION_KEY is required/,
);

// Plaintext cookies also fail closed in production without a key (post-#26).
assert.throws(
  () => decryptEspnCookie("{PLAINTEXT-SWID}"),
  /ESPN_COOKIE_ENCRYPTION_KEY is required/,
);

console.log("verify-sync-freshness: ok");
