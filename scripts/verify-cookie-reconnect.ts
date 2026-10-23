/**
 * Regression guard for issue #44:
 * Reconnect with blank SWID / espn_s2 must not wipe stored encrypted cookies.
 *
 * Run: npm run verify:cookie-reconnect
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  decryptEspnCookie,
  encryptEspnCookie,
  espnCookieUpdateFields,
  isEncryptedEspnCookie,
} from "../src/lib/espn/cookie-crypto";

function setNodeEnv(value: string | undefined) {
  const env = process.env as { NODE_ENV?: string };
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

const keyB64 = randomBytes(32).toString("base64");
process.env.ESPN_COOKIE_ENCRYPTION_KEY = keyB64;
setNodeEnv("test");

const swid = "{ABCDEF12-3456-7890-ABCD-EF1234567890}";
const espnS2 = "AE%s2_cookie_value_with%2Burl%2Fencoding==";
const swidNext = "{11111111-2222-3333-4444-555555555555}";
const espnS2Next = "AE%replacement_cookie_value==";

// ── update fields: blank / whitespace keep prior columns ─────────────
assert.deepEqual(espnCookieUpdateFields({}), {});
assert.deepEqual(espnCookieUpdateFields({ swid: undefined, espnS2: undefined }), {});
assert.deepEqual(espnCookieUpdateFields({ swid: null, espnS2: null }), {});
assert.deepEqual(espnCookieUpdateFields({ swid: "", espnS2: "" }), {});
assert.deepEqual(espnCookieUpdateFields({ swid: "   ", espnS2: "\t\n" }), {});

// ── both cookies supplied → both columns encrypted ───────────────────
const both = espnCookieUpdateFields({ swid, espnS2 });
assert.ok(both.espnSwid && isEncryptedEspnCookie(both.espnSwid));
assert.ok(both.espnS2 && isEncryptedEspnCookie(both.espnS2));
assert.equal(decryptEspnCookie(both.espnSwid), swid);
assert.equal(decryptEspnCookie(both.espnS2), espnS2);

// ── only one cookie supplied → only that column ──────────────────────
const swidOnly = espnCookieUpdateFields({ swid: swidNext, espnS2: "" });
assert.ok(swidOnly.espnSwid && isEncryptedEspnCookie(swidOnly.espnSwid));
assert.equal(decryptEspnCookie(swidOnly.espnSwid), swidNext);
assert.equal("espnS2" in swidOnly, false);

const s2Only = espnCookieUpdateFields({ swid: "  ", espnS2: espnS2Next });
assert.equal("espnSwid" in s2Only, false);
assert.ok(s2Only.espnS2 && isEncryptedEspnCookie(s2Only.espnS2));
assert.equal(decryptEspnCookie(s2Only.espnS2), espnS2Next);

// Simulate Prisma merge: blank reconnect must leave prior ciphertext alone.
const stored = {
  espnSwid: encryptEspnCookie(swid),
  espnS2: encryptEspnCookie(espnS2),
};
assert.ok(stored.espnSwid && stored.espnS2);

const afterBlankReconnect = {
  ...stored,
  ...espnCookieUpdateFields({ swid: undefined, espnS2: undefined }),
};
assert.equal(afterBlankReconnect.espnSwid, stored.espnSwid);
assert.equal(afterBlankReconnect.espnS2, stored.espnS2);
assert.equal(decryptEspnCookie(afterBlankReconnect.espnSwid), swid);
assert.equal(decryptEspnCookie(afterBlankReconnect.espnS2), espnS2);

// Partial replace: new SWID only, keep stored espn_s2.
const afterSwidReplace = {
  ...stored,
  ...espnCookieUpdateFields({ swid: swidNext }),
};
assert.notEqual(afterSwidReplace.espnSwid, stored.espnSwid);
assert.equal(decryptEspnCookie(afterSwidReplace.espnSwid), swidNext);
assert.equal(afterSwidReplace.espnS2, stored.espnS2);

// create path still nulls empty cookies (encryptEspnCookie contract).
assert.equal(encryptEspnCookie(undefined), null);
assert.equal(encryptEspnCookie(""), null);

// ── source guards: reconnect update must use preserve helper ─────────
const root = path.join(__dirname, "..");
const service = fs.readFileSync(
  path.join(root, "src/lib/league/service.ts"),
  "utf8",
);
assert.match(service, /espnCookieUpdateFields/);
assert.match(service, /leagueConnectionCookieUpdateFields/);
const updateBlock = service.match(/update:\s*\{[\s\S]*?\n\s*\},/);
assert.ok(updateBlock, "connectEspnLeague must have an upsert update block");
assert.match(
  updateBlock[0],
  /\.\.\.leagueConnectionCookieUpdateFields\(/,
  "reconnect update must spread leagueConnectionCookieUpdateFields",
);
assert.doesNotMatch(
  updateBlock[0],
  /espnSwid:\s*encryptEspnCookie\(creds\.swid\)/,
  "reconnect update must not unconditionally overwrite espnSwid",
);
assert.doesNotMatch(
  updateBlock[0],
  /espnS2:\s*encryptEspnCookie\(creds\.espnS2\)/,
  "reconnect update must not unconditionally overwrite espnS2",
);

const form = fs.readFileSync(
  path.join(root, "src/components/connect-league-form.tsx"),
  "utf8",
);
assert.match(
  form,
  /Leave SWID and espn_s2 blank to keep the ESPN login/i,
  "connect form should hint that blank cookies keep the saved login",
);

console.log("verify-cookie-reconnect: ok");
