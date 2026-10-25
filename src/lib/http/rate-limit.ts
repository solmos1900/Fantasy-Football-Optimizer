/**
 * Fixed-window rate limiter for API routes and auth (server-only).
 *
 * Counters live in Postgres (`ApiRateLimit`) so every serverless instance
 * shares them — an in-memory Map only limited a single warm instance.
 * If the database is unreachable we fall back to the per-instance Map so a
 * DB blip degrades limiting instead of taking auth down.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

type Bucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
};

/** Window start (ms) for a fixed window of `windowMs`. */
export function windowStartMs(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function decideRateLimit(
  count: number,
  limit: number,
  resetAt: number,
): RateLimitResult {
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

/** Per-instance fallback (also used by unit checks without a database). */
export function rateLimitInMemory(options: RateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();
  const existing = memoryBuckets.get(options.key);
  if (!existing || now >= existing.resetAt) {
    const resetAt = windowStartMs(now, options.windowMs) + options.windowMs;
    memoryBuckets.set(options.key, { count: 1, resetAt });
    return decideRateLimit(1, options.limit, resetAt);
  }
  existing.count += 1;
  return decideRateLimit(existing.count, options.limit, existing.resetAt);
}

/**
 * Atomically increment the shared counter for this key's current window and
 * report whether the caller is still within `limit`.
 */
export async function rateLimit(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = options.now ?? Date.now();
  const start = windowStartMs(now, options.windowMs);
  const resetAt = start + options.windowMs;
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "ApiRateLimit" ("id", "bucketKey", "windowStart", "count", "updatedAt")
      VALUES (${`rl_${createHash("sha256").update(`${options.key}|${start}`).digest("hex").slice(0, 24)}`},
              ${options.key}, ${new Date(start)}, 1, NOW())
      ON CONFLICT ("bucketKey", "windowStart")
      DO UPDATE SET "count" = "ApiRateLimit"."count" + 1, "updatedAt" = NOW()
      RETURNING "count"
    `;
    const count = Number(rows[0]?.count ?? 1);
    return decideRateLimit(count, options.limit, resetAt);
  } catch (err) {
    console.error("[rate-limit] shared counter unavailable; using per-instance fallback", err);
    return rateLimitInMemory(options);
  }
}

/** Client IP from common proxy headers (Vercel / reverse proxy). */
export function clientIpFromRequest(request: Pick<Request, "headers">): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Stable, non-reversible key fragment for an IP / email so raw identifiers
 * are never stored in the counter table.
 */
export function hashedKeyPart(value: string): string {
  const pepper = process.env.AUTH_SECRET ?? "";
  return createHash("sha256")
    .update(`${pepper}|${value.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
}
