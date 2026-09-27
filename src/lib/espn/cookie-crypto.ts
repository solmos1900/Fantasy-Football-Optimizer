/**
 * Encrypt ESPN league cookies (SWID / espn_s2) at rest in LeagueConnection.
 *
 * Format: enc:v1:<base64(iv[12] || authTag[16] || ciphertext)>
 * Plaintext rows (no prefix) still decrypt/read until the next write re-encrypts.
 *
 * Key: ESPN_COOKIE_ENCRYPTION_KEY — 32-byte secret as base64 or 64-char hex.
 * Generate: openssl rand -base64 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const ESPN_COOKIE_ENC_PREFIX = "enc:v1:";

const ALGO = "aes-256-gcm" as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function missingKeyMessage(): string {
  return (
    "ESPN_COOKIE_ENCRYPTION_KEY is required to store or use ESPN cookies. " +
    "Generate with: openssl rand -base64 32"
  );
}

/** Parse a raw key string into a 32-byte Buffer, or null if unset/empty. */
export function resolveEspnCookieEncryptionKey(
  raw: string | undefined | null,
): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;

  // Prefer hex when unambiguously 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const fromB64 = Buffer.from(value, "base64");
    if (fromB64.length === KEY_BYTES) return fromB64;
  } catch {
    // fall through
  }

  throw new Error(
    "ESPN_COOKIE_ENCRYPTION_KEY must be 32 bytes (openssl rand -base64 32) or 64 hex chars.",
  );
}

function keyFromEnv(): Buffer | null {
  return resolveEspnCookieEncryptionKey(process.env.ESPN_COOKIE_ENCRYPTION_KEY);
}

function requireKeyForCookies(): Buffer | null {
  const key = keyFromEnv();
  if (key) return key;

  if (isProduction()) {
    throw new Error(missingKeyMessage());
  }

  console.warn(
    "[espn-cookie-crypto] ESPN_COOKIE_ENCRYPTION_KEY unset — storing/reading cookies as plaintext (dev only).",
  );
  return null;
}

export function isEncryptedEspnCookie(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && value.startsWith(ESPN_COOKIE_ENC_PREFIX);
}

/**
 * Encrypt a cookie for DB storage. Returns null for empty input.
 * Production without a key fails closed; local may pass plaintext through.
 */
export function encryptEspnCookie(
  plaintext: string | null | undefined,
): string | null {
  if (plaintext == null) return null;
  const trimmed = plaintext.trim();
  if (!trimmed) return null;

  // Idempotent if somehow already ciphertext
  if (isEncryptedEspnCookie(trimmed)) return trimmed;

  const key = requireKeyForCookies();
  if (!key) return trimmed;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(trimmed, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]);
  return `${ESPN_COOKIE_ENC_PREFIX}${payload.toString("base64")}`;
}

/**
 * Decrypt a stored cookie value. Plaintext (no enc:v1: prefix) is returned as-is
 * for backward compatibility until the next write re-encrypts.
 */
export function decryptEspnCookie(
  stored: string | null | undefined,
): string | null {
  if (stored == null) return null;
  if (!stored) return null;

  if (!isEncryptedEspnCookie(stored)) {
    // Plaintext legacy row — still require a key in production when cookies exist
    requireKeyForCookies();
    return stored;
  }

  const key = keyFromEnv();
  if (!key) {
    throw new Error(missingKeyMessage());
  }

  const b64 = stored.slice(ESPN_COOKIE_ENC_PREFIX.length);
  let payload: Buffer;
  try {
    payload = Buffer.from(b64, "base64");
  } catch {
    throw new Error("Corrupt ESPN cookie ciphertext (invalid base64).");
  }

  if (payload.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Corrupt ESPN cookie ciphertext (payload too short).");
  }

  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const data = payload.subarray(IV_BYTES + TAG_BYTES);

  try {
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new Error(
      "Failed to decrypt ESPN cookie — check ESPN_COOKIE_ENCRYPTION_KEY matches the key used to encrypt.",
    );
  }
}
