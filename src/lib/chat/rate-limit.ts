/**
 * Daily chat rate limits — guests ~20/day, signed-in a higher cap.
 * Pure helpers + Prisma-backed counter (Hobby-friendly, no Redis).
 */

import { prisma } from "@/lib/db";
import {
  CHAT_GUEST_DAILY_LIMIT,
  CHAT_USER_DAILY_LIMIT,
} from "@/lib/chat/config";
import { createHash } from "node:crypto";

export type RateLimitKind = "guest" | "user";

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

export function limitForKind(kind: RateLimitKind): number {
  return kind === "guest" ? CHAT_GUEST_DAILY_LIMIT : CHAT_USER_DAILY_LIMIT;
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
        kind === "guest"
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
