/**
 * First-party product analytics (server-only). Events live in Postgres
 * (`AnalyticsEvent`, `ActiveDay`); there is no third-party tracker.
 *
 * Tracking must never break a request: every writer here swallows its own
 * errors and logs them.
 */

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Every event name the app records. Add here before recording a new one. */
export const ANALYTICS_EVENTS = [
  "guest_created",
  "account_created",
  "league_connected",
  "chat_blocked",
  "trade_analyzed",
  "who_to_start_compared",
  "chat_template_used",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** Subset the browser may send through POST /api/analytics/event. */
export const CLIENT_ANALYTICS_EVENTS = [
  "trade_analyzed",
  "who_to_start_compared",
  "chat_template_used",
] as const satisfies readonly AnalyticsEventName[];

export function isClientAnalyticsEvent(
  name: unknown,
): name is (typeof CLIENT_ANALYTICS_EVENTS)[number] {
  return (
    typeof name === "string" &&
    (CLIENT_ANALYTICS_EVENTS as readonly string[]).includes(name)
  );
}

// ── Acquisition source (first touch) ──────────────────────────────────────

/** Cookie set by <AttributionCapture /> from ?utm_source / ?ref on first visit. */
export const ATTRIBUTION_COOKIE = "giq_src";

/**
 * Normalize a raw source value: lowercase, `source` or `source:campaign`,
 * letters/digits/`_-.` only, max 60 chars. Anything else → null.
 */
export function normalizeAttributionSource(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const value = decoded.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{1,40}(:[a-z0-9_.-]{1,40})?$/.test(value)) return null;
  return value.slice(0, 60);
}

/** Read the attribution cookie out of a Cookie header. */
export function attributionFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === ATTRIBUTION_COOKIE) return normalizeAttributionSource(rest.join("="));
  }
  return null;
}

// ── Writers ───────────────────────────────────────────────────────────────

export async function trackEvent(event: {
  name: AnalyticsEventName;
  userId?: string | null;
  isGuest?: boolean;
  props?: Record<string, string | number | boolean | null>;
  source?: string | null;
}): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        name: event.name,
        userId: event.userId ?? null,
        isGuest: Boolean(event.isGuest),
        props: (event.props ?? undefined) as Prisma.InputJsonValue | undefined,
        source: event.source ?? null,
      },
    });
  } catch (err) {
    console.error(`[analytics] failed to record ${event.name}`, err);
  }
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Per-instance memo so a user browsing many pages writes one row per day.
const recordedToday = new Map<string, string>();

/** Mark the user active for today (UTC). Idempotent; never throws. */
export async function recordActiveDay(input: {
  userId: string;
  isGuest: boolean;
  source?: string | null;
  now?: Date;
}): Promise<void> {
  const day = utcDay(input.now);
  if (recordedToday.get(input.userId) === day) return;
  try {
    await prisma.activeDay.upsert({
      where: { userId_day: { userId: input.userId, day } },
      create: {
        userId: input.userId,
        day,
        isGuest: input.isGuest,
        source: input.source ?? null,
      },
      update: {},
    });
    recordedToday.set(input.userId, day);
    if (recordedToday.size > 10_000) recordedToday.clear();
  } catch (err) {
    console.error("[analytics] failed to record active day", err);
  }
}
