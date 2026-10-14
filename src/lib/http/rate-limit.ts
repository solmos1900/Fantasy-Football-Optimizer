/**
 * Lightweight in-memory rate limiter for public API routes (server-only).
 * Best-effort per-instance; not a substitute for edge WAF.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

export function rateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(options.key);
  if (!existing || now >= existing.resetAt) {
    const resetAt = now + options.windowMs;
    buckets.set(options.key, { count: 1, resetAt });
    return { ok: true, remaining: options.limit - 1, resetAt };
  }
  if (existing.count >= options.limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: options.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/** Client IP from common proxy headers (Vercel / reverse proxy). */
export function clientIpFromRequest(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
