/**
 * Regression guard for issue #105:
 * Sync must not rewrite ESPN cookie columns with the values it read at start,
 * so a mid-flight Connect/reconnect with rotated cookies is not rolled back.
 *
 * Run: npm run verify:sync-stale-cookies
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  decryptEspnCookie,
  encryptEspnCookie,
  espnCookieUpdateFields,
} from "../src/lib/espn/cookie-crypto";
import { leagueConnectionCookieUpdateFields } from "../src/lib/league/service";

function setNodeEnv(value: string | undefined) {
  const env = process.env as { NODE_ENV?: string };
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

const keyB64 = randomBytes(32).toString("base64");
process.env.ESPN_COOKIE_ENCRYPTION_KEY = keyB64;
setNodeEnv("test");

const c1Swid = "{CCCCCCCC-1111-1111-1111-111111111111}";
const c1S2 = "AE%cookie_C1==";
const c2Swid = "{DDDDDDDD-2222-2222-2222-222222222222}";
const c2S2 = "AE%cookie_C2==";

// Sync path: persistCookies=false → no cookie columns in the update patch.
const syncPatch = leagueConnectionCookieUpdateFields({
  persistCookies: false,
  swid: c1Swid,
  espnS2: c1S2,
});
assert.deepEqual(
  syncPatch,
  {},
  "Sync must omit espnSwid/espnS2 so stale cookies are not written back",
);

// Connect path: persistCookies=true still encrypts supplied cookies (#44 preserve on blank).
const connectPatch = leagueConnectionCookieUpdateFields({
  persistCookies: true,
  swid: c2Swid,
  espnS2: c2S2,
});
assert.ok(connectPatch.espnSwid);
assert.ok(connectPatch.espnS2);
assert.equal(decryptEspnCookie(connectPatch.espnSwid), c2Swid);
assert.equal(decryptEspnCookie(connectPatch.espnS2), c2S2);

const blankConnect = leagueConnectionCookieUpdateFields({
  persistCookies: true,
  swid: "",
  espnS2: undefined,
});
assert.deepEqual(blankConnect, {});

// Simulate: Sync started with C1, reconnect wrote C2, Sync finishes.
const afterReconnect = {
  espnSwid: encryptEspnCookie(c2Swid),
  espnS2: encryptEspnCookie(c2S2),
};
assert.ok(afterReconnect.espnSwid && afterReconnect.espnS2);

const afterStaleSyncWouldHaveWritten = {
  ...afterReconnect,
  ...leagueConnectionCookieUpdateFields({
    persistCookies: false,
    swid: c1Swid,
    espnS2: c1S2,
  }),
};
assert.equal(afterStaleSyncWouldHaveWritten.espnSwid, afterReconnect.espnSwid);
assert.equal(afterStaleSyncWouldHaveWritten.espnS2, afterReconnect.espnS2);
assert.equal(decryptEspnCookie(afterStaleSyncWouldHaveWritten.espnSwid), c2Swid);
assert.equal(decryptEspnCookie(afterStaleSyncWouldHaveWritten.espnS2), c2S2);

// Contrast: old buggy Sync (always spreading espnCookieUpdateFields) would clobber C2.
const buggySyncFinish = {
  ...afterReconnect,
  ...espnCookieUpdateFields({ swid: c1Swid, espnS2: c1S2 }),
};
assert.equal(decryptEspnCookie(buggySyncFinish.espnSwid!), c1Swid);
assert.equal(decryptEspnCookie(buggySyncFinish.espnS2!), c1S2);

// ── source guards ────────────────────────────────────────────────────
const root = path.join(__dirname, "..");
const service = fs.readFileSync(
  path.join(root, "src/lib/league/service.ts"),
  "utf8",
);

const refreshStart = service.indexOf("export async function refreshUserLeague");
assert.ok(refreshStart >= 0, "refreshUserLeague must exist");
const refreshFn = service.slice(refreshStart);
assert.match(
  refreshFn,
  /persistCookies:\s*false/,
  "refreshUserLeague (Sync) must pass persistCookies: false",
);

const connectStart = service.indexOf("export async function connectEspnLeague");
const connectFn = service.slice(connectStart, refreshStart);
assert.match(
  connectFn,
  /leagueConnectionCookieUpdateFields/,
  "connectEspnLeague update must use leagueConnectionCookieUpdateFields",
);
assert.match(
  connectFn,
  /persistCookies/,
  "connectEspnLeague must honor persistCookies",
);

console.log("verify-sync-stale-cookies: ok");
console.log("  Sync omits cookie columns on update");
console.log("  Connect still writes supplied cookies");
console.log("  mid-sync reconnect C2 survives Sync finish with C1");
