/**
 * Regression guard for issue #104:
 * Connect with blank SWID / espn_s2 must use decrypted cookies saved on the
 * same (userId, leagueId, season) row for the ESPN fetch — same as Sync.
 * Newly typed cookies still win; blank upsert must not wipe stored columns (#44).
 *
 * Run: npm run verify:connect-blank-cookies
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
import { resolveEspnFetchCookies } from "../src/lib/league/service";

function setNodeEnv(value: string | undefined) {
  const env = process.env as { NODE_ENV?: string };
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

const keyB64 = randomBytes(32).toString("base64");
process.env.ESPN_COOKIE_ENCRYPTION_KEY = keyB64;
setNodeEnv("test");

const savedSwid = "{AAAAAAAA-1111-1111-1111-111111111111}";
const savedS2 = "AE%saved_cookie_s2==";
const typedSwid = "{BBBBBBBB-2222-2222-2222-222222222222}";
const typedS2 = "AE%typed_cookie_s2==";

const stored = {
  espnSwid: encryptEspnCookie(savedSwid),
  espnS2: encryptEspnCookie(savedS2),
};
assert.ok(stored.espnSwid && stored.espnS2);

// Blank Connect → use saved cookies for the fetch (the #104 bug).
const blankReuse = resolveEspnFetchCookies({
  swid: "",
  espnS2: undefined,
  stored,
});
assert.equal(blankReuse.swid, savedSwid);
assert.equal(blankReuse.espnS2, savedS2);

// Whitespace-only counts as blank.
const wsReuse = resolveEspnFetchCookies({
  swid: "   ",
  espnS2: "\t",
  stored,
});
assert.equal(wsReuse.swid, savedSwid);
assert.equal(wsReuse.espnS2, savedS2);

// Newly typed cookies take precedence over saved.
const typedWins = resolveEspnFetchCookies({
  swid: typedSwid,
  espnS2: typedS2,
  stored,
});
assert.equal(typedWins.swid, typedSwid);
assert.equal(typedWins.espnS2, typedS2);

// Partial: typed SWID + blank espn_s2 → keep saved espn_s2 for fetch.
const partial = resolveEspnFetchCookies({
  swid: typedSwid,
  espnS2: "",
  stored,
});
assert.equal(partial.swid, typedSwid);
assert.equal(partial.espnS2, savedS2);

// No stored row (first connect / public) → blanks stay undefined.
const noStored = resolveEspnFetchCookies({
  swid: "",
  espnS2: "",
  stored: null,
});
assert.equal(noStored.swid, undefined);
assert.equal(noStored.espnS2, undefined);

// Empty stored columns (public league reconnect) → no fake cookies.
const emptyStored = resolveEspnFetchCookies({
  swid: undefined,
  espnS2: undefined,
  stored: { espnSwid: null, espnS2: null },
});
assert.equal(emptyStored.swid, undefined);
assert.equal(emptyStored.espnS2, undefined);

// Different league scope: caller only passes stored for the matching
// userId_leagueId_season row — a null/missing stored must not invent cookies.
const otherLeague = resolveEspnFetchCookies({
  swid: "",
  espnS2: "",
  stored: undefined,
});
assert.deepEqual(otherLeague, { swid: undefined, espnS2: undefined });

// #44 still holds: blank upsert fields do not wipe ciphertext.
// Fetch may resolve saved cookies into creds, but the upsert must still be
// driven by the blank submitted input — not the resolved fetch values.
const fetchCreds = resolveEspnFetchCookies({
  swid: "",
  espnS2: "",
  stored,
});
assert.equal(fetchCreds.swid, savedSwid);
assert.equal(fetchCreds.espnS2, savedS2);

const afterBlankUpsert = {
  ...stored,
  // Simulate connectEspnLeague update: pass submitted blanks, not fetchCreds.
  ...espnCookieUpdateFields({ swid: "", espnS2: "" }),
};
assert.equal(afterBlankUpsert.espnSwid, stored.espnSwid);
assert.equal(afterBlankUpsert.espnS2, stored.espnS2);
assert.equal(decryptEspnCookie(afterBlankUpsert.espnSwid), savedSwid);
assert.equal(decryptEspnCookie(afterBlankUpsert.espnS2), savedS2);

// Contrast: wrongly spreading resolved fetch creds would rewrite columns.
const wrongUpsert = {
  ...stored,
  ...espnCookieUpdateFields({
    swid: fetchCreds.swid,
    espnS2: fetchCreds.espnS2,
  }),
};
assert.ok(wrongUpsert.espnSwid);
assert.notEqual(
  wrongUpsert.espnSwid,
  stored.espnSwid,
  "re-encrypting resolved cookies would change ciphertext (must not happen on blank)",
);

// ── source guards ────────────────────────────────────────────────────
const root = path.join(__dirname, "..");
const service = fs.readFileSync(
  path.join(root, "src/lib/league/service.ts"),
  "utf8",
);

const connectStart = service.indexOf("export async function connectEspnLeague");
const refreshStart = service.indexOf("export async function refreshUserLeague");
assert.ok(connectStart >= 0, "connectEspnLeague must exist");
assert.ok(refreshStart > connectStart, "refreshUserLeague must follow connect");

const connectFn = service.slice(connectStart, refreshStart);
assert.match(
  connectFn,
  /resolveEspnFetchCookies/,
  "connectEspnLeague must resolve fetch cookies via resolveEspnFetchCookies",
);
assert.match(
  connectFn,
  /stored:\s*existing/,
  "connect must pass the same-league connection row as stored cookies",
);
assert.doesNotMatch(
  connectFn,
  /swid:\s*input\.swid\?\.trim\(\)\s*\|\|\s*undefined/,
  "connect must not build fetch creds from the request body alone",
);
assert.match(
  connectFn,
  /leagueConnectionCookieUpdateFields\(\{[\s\S]*?swid:\s*input\.swid/,
  "upsert cookie fields must use submitted input (blank preserve), not resolved fetch creds",
);

const refreshFn = service.slice(refreshStart);
assert.match(
  refreshFn,
  /persistCookies:\s*false/,
  "Sync must still omit cookie writes",
);

const form = fs.readFileSync(
  path.join(root, "src/components/connect-league-form.tsx"),
  "utf8",
);
assert.match(
  form,
  /Leave SWID and espn_s2 blank to keep the ESPN login/i,
  "connect form should still hint that blank cookies keep the saved login",
);

console.log("verify-connect-blank-cookies: ok");
console.log("  blank Connect reuses saved cookies for same league/season");
console.log("  typed cookies still take precedence");
console.log("  blank upsert still preserves stored columns (#44)");
