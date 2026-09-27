/**
 * Unit checks for ESPN cookie encrypt-at-rest (no DB required).
 *
 * Run: npm run verify:cookie-crypto
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  decryptEspnCookie,
  encryptEspnCookie,
  ESPN_COOKIE_ENC_PREFIX,
  isEncryptedEspnCookie,
  resolveEspnCookieEncryptionKey,
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

// Key parsing
assert.equal(resolveEspnCookieEncryptionKey(keyB64)?.length, 32);
assert.equal(
  resolveEspnCookieEncryptionKey(randomBytes(32).toString("hex"))?.length,
  32,
);
assert.equal(resolveEspnCookieEncryptionKey(""), null);
assert.equal(resolveEspnCookieEncryptionKey(undefined), null);

// Round-trip
const encSwid = encryptEspnCookie(swid);
const encS2 = encryptEspnCookie(espnS2);
assert.ok(encSwid && isEncryptedEspnCookie(encSwid));
assert.ok(encS2 && isEncryptedEspnCookie(encS2));
assert.ok(encSwid.startsWith(ESPN_COOKIE_ENC_PREFIX));
assert.notEqual(encSwid, swid);
assert.notEqual(encS2, espnS2);
assert.equal(decryptEspnCookie(encSwid), swid);
assert.equal(decryptEspnCookie(encS2), espnS2);

// Distinct IVs → different ciphertext for same plaintext
const again = encryptEspnCookie(swid);
assert.notEqual(again, encSwid);
assert.equal(decryptEspnCookie(again), swid);

// Empty / null
assert.equal(encryptEspnCookie(null), null);
assert.equal(encryptEspnCookie(""), null);
assert.equal(encryptEspnCookie("   "), null);
assert.equal(decryptEspnCookie(null), null);
assert.equal(decryptEspnCookie(""), null);

// Idempotent encrypt of already-ciphertext
assert.equal(encryptEspnCookie(encSwid), encSwid);

// Plaintext compatibility (legacy rows)
assert.equal(decryptEspnCookie(swid), swid);
assert.equal(decryptEspnCookie(espnS2), espnS2);
assert.equal(isEncryptedEspnCookie(swid), false);

// Wrong key fails closed
process.env.ESPN_COOKIE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
assert.throws(
  () => decryptEspnCookie(encSwid!),
  /Failed to decrypt|ESPN_COOKIE/,
);

// Restore key — ciphertext still decrypts
process.env.ESPN_COOKIE_ENCRYPTION_KEY = keyB64;
assert.equal(decryptEspnCookie(encSwid), swid);

// Production without key fails when cookies are present
const prevEnv = process.env.NODE_ENV;
setNodeEnv("production");
delete process.env.ESPN_COOKIE_ENCRYPTION_KEY;
assert.throws(() => encryptEspnCookie(swid), /ESPN_COOKIE_ENCRYPTION_KEY/);
assert.throws(() => decryptEspnCookie(swid), /ESPN_COOKIE_ENCRYPTION_KEY/);
assert.throws(
  () => decryptEspnCookie(encSwid!),
  /ESPN_COOKIE_ENCRYPTION_KEY/,
);
setNodeEnv(prevEnv);

console.log("verify-cookie-crypto: ok");
