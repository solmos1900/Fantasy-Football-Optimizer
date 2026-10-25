/**
 * Daily chat rate limits — guests ~20/day, signed-in a higher cap.
 * Pure helpers + Prisma-backed counter (Hobby-friendly, no Redis).
 */

import { prisma } from "@/lib/db";
import {
  CHAT_GUEST_DAILY_LIMIT,
  CHAT_GUEST_IP_DAILY_LIMIT,
  CHAT_USER_DAILY_LIMIT,
  chatTokenBudgets,
} from "@/lib/chat/config";
import { createHash } from "node:crypto";

export type RateLimitKind = "guest" | "guest-ip" | "user";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  limit: number;
  dayKey: string;
  /** Friendly message when blocked. */
  message?: string;
};

export function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function guestBucketKey(ip: string | null, guestSessionId: string | null): string {
  const raw = `${ip ?? "unknown"}|${guestSessionId ?? "session"}`;
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 24);
  return `guest:${hash}`;
}

export function userBucketKey(userId: string): string {
  return `user:${userId}`;
}

/** Shared by every guest session from one client IP. */
export function guestIpBucketKey(ip: string | null): string {
  const hash = createHash("sha256")
    .update(`guest-ip|${ip ?? "unknown"}`)
    .digest("hex")
    .slice(0, 24);
  return `guest-ip:${hash}`;
}

export function limitForKind(kind: RateLimitKind): number {
  if (kind === "guest") return CHAT_GUEST_DAILY_LIMIT;
  if (kind === "guest-ip") return CHAT_GUEST_IP_DAILY_LIMIT;
  return CHAT_USER_DAILY_LIMIT;
}

export function evaluateRateLimitCount(
  count: number,
  kind: RateLimitKind,
  dayKey: string,
): RateLimitDecision {
  const limit = limitForKind(kind);
  const remaining = Math.max(0, limit - count);
  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      dayKey,
      message:
        kind === "guest" || kind === "guest-ip"
          ? `You've hit today's guest limit (${limit} questions). Come back tomorrow, or sign in for a higher daily cap.`
          : `You've hit today's chat limit (${limit} questions). Try again tomorrow — Trade Analyzer and Who to Start under Trades still work.`,
    };
  }
  return { allowed: true, remaining, limit, dayKey };
}

/**
 * Atomically check-and-increment. Returns decision after increment when allowed,
 * or blocked decision without incrementing when already at cap.
 */
export async function consumeChatRateLimit(options: {
  bucketKey: string;
  kind: RateLimitKind;
  now?: Date;
}): Promise<RateLimitDecision> {
  const dayKey = utcDayKey(options.now);
  const limit = limitForKind(options.kind);

  const existing = await prisma.chatRateLimit.findUnique({
    where: {
      bucketKey_dayKey: { bucketKey: options.bucketKey, dayKey },
    },
  });

  if (existing && existing.count >= limit) {
    return evaluateRateLimitCount(existing.count, options.kind, dayKey);
  }

  const row = await prisma.chatRateLimit.upsert({
    where: {
      bucketKey_dayKey: { bucketKey: options.bucketKey, dayKey },
    },
    create: { bucketKey: options.bucketKey, dayKey, count: 1 },
    update: { count: { increment: 1 } },
  });

  // After increment: remaining based on new count
  const decision = evaluateRateLimitCount(row.count - 1, options.kind, dayKey);
  if (!decision.allowed) {
    // Race: another request filled the bucket — roll back this increment best-effort
    await prisma.chatRateLimit.update({
      where: { id: row.id },
      data: { count: { decrement: 1 } },
    });
    return evaluateRateLimitCount(limit, options.kind, dayKey);
  }
  return {
    allowed: true,
    remaining: Math.max(0, limit - row.count),
    limit,
    dayKey,
  };
}

// ── Token budgets ─────────────────────────────────────────────────────────
// Stored in the same ChatRateLimit table: bucketKey "tokens:<scope>", count =
// tokens used that UTC day. Question caps bound request count; these bound cost.

export const GLOBAL_TOKEN_BUCKET = "tokens:global";

export function tokenBucketKey(bucketKey: string): string {
  return `tokens:${bucketKey}`;
}

export type TokenBudgetDecision = {
  allowed: boolean;
  scope?: "global" | "caller";
};

/** Pure check: is either the caller's or the global token budget spent? */
export function evaluateTokenBudget(input: {
  callerUsed: number;
  callerBudget: number;
  globalUsed: number;
  globalBudget: number;
}): TokenBudgetDecision {
  if (input.globalBudget > 0 && input.globalUsed >= input.globalBudget) {
    return { allowed: false, scope: "global" };
  }
  if (input.callerBudget > 0 && input.callerUsed >= input.callerBudget) {
    return { allowed: false, scope: "caller" };
  }
  return { allowed: true };
}

export async function checkTokenBudget(options: {
  bucketKey: string;
  kind: "guest" | "user";
  now?: Date;
}): Promise<TokenBudgetDecision> {
  const dayKey = utcDayKey(options.now);
  const budgets = chatTokenBudgets();
  const rows = await prisma.chatRateLimit.findMany({
    where: {
      dayKey,
      bucketKey: { in: [tokenBucketKey(options.bucketKey), GLOBAL_TOKEN_BUCKET] },
    },
    select: { bucketKey: true, count: true },
  });
  const used = (key: string) => rows.find((r) => r.bucketKey === key)?.count ?? 0;
  return evaluateTokenBudget({
    callerUsed: used(tokenBucketKey(options.bucketKey)),
    callerBudget: options.kind === "guest" ? budgets.guest : budgets.user,
    globalUsed: used(GLOBAL_TOKEN_BUCKET),
    globalBudget: budgets.global,
  });
}

/** Add a finished turn's tokens to the caller and global counters. */
export async function recordTokenSpend(options: {
  bucketKey: string;
  tokens: number;
  now?: Date;
}): Promise<void> {
  const tokens = Math.max(0, Math.round(options.tokens));
  if (tokens === 0) return;
  const dayKey = utcDayKey(options.now);
  await Promise.all(
    [tokenBucketKey(options.bucketKey), GLOBAL_TOKEN_BUCKET].map((bucketKey) =>
      prisma.chatRateLimit.upsert({
        where: { bucketKey_dayKey: { bucketKey, dayKey } },
        create: { bucketKey, dayKey, count: tokens },
        update: { count: { increment: tokens } },
      }),
    ),
  );
}
