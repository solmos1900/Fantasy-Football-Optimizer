/**
 * Launch metrics: weekly active users, questions per user, cost per question,
 * acquisition source and feature events. Read by /admin/metrics and
 * GET /api/admin/metrics.
 *
 * Weeks are trailing 7-day UTC windows ending today (week 0 = the last 7
 * days including today), so "this week" is always a full week.
 *
 * Aggregation is pure (`summarizeMetrics`) so it is unit-tested offline; the
 * loader pulls the raw rows for the window. At launch scale (thousands of
 * rows) that is cheaper to maintain than SQL rollups.
 */

import { prisma } from "@/lib/db";
import { utcDay } from "@/lib/analytics/events";

export type ActiveDayRow = { userId: string; day: string; isGuest: boolean; source: string | null };
export type UsageRow = {
  userId: string | null;
  isGuest: boolean;
  createdAt: Date;
  costUsd: number | null;
  toolCalls: number;
  totalTokens: number;
};
export type EventRow = {
  name: string;
  userId: string | null;
  createdAt: Date;
  source: string | null;
  props: unknown;
};

export type WeekMetrics = {
  /** First and last UTC day of the window, inclusive. */
  start: string;
  end: string;
  activeUsers: number;
  activeSignedIn: number;
  activeGuests: number;
  questions: number;
  /** Distinct users who asked at least one question. */
  askers: number;
  /** questions / activeUsers (null with no active users). */
  questionsPerActiveUser: number | null;
  /** questions / askers. */
  questionsPerAsker: number | null;
  /** Sum of known per-turn costs. */
  costUsd: number;
  /** Mean cost over turns whose cost is known. */
  costPerQuestionUsd: number | null;
  /** Share of turns with a known cost (pricing available). */
  costCoverage: number | null;
  toolCallsPerQuestion: number | null;
  tokensPerQuestion: number | null;
};

export type ProductMetrics = {
  generatedAt: string;
  weeks: WeekMetrics[];
  /** Daily active users for the last 14 days, oldest first. */
  daily: { day: string; activeUsers: number; questions: number }[];
  /** Active users this week by first-touch source ("direct" when none). */
  sourcesThisWeek: { source: string; activeUsers: number; newAccounts: number }[];
  /** Event counts this week, by name. */
  eventsThisWeek: { name: string; count: number; users: number }[];
  /** chat_blocked this week, by reason. */
  blockedThisWeek: { reason: string; count: number }[];
};

const DAY_MS = 24 * 60 * 60_000;

function dayOffset(now: Date, days: number): string {
  return utcDay(new Date(now.getTime() - days * DAY_MS));
}

function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

function propString(props: unknown, key: string): string | null {
  if (!props || typeof props !== "object") return null;
  const v = (props as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

export function summarizeMetrics(input: {
  now: Date;
  weeks: number;
  activeDays: ActiveDayRow[];
  usage: UsageRow[];
  events: EventRow[];
}): ProductMetrics {
  const { now } = input;
  const weeks: WeekMetrics[] = [];
  for (let w = 0; w < input.weeks; w++) {
    const end = dayOffset(now, w * 7);
    const start = dayOffset(now, w * 7 + 6);
    const inWeek = (day: string) => day >= start && day <= end;

    const active = new Map<string, boolean>();
    for (const r of input.activeDays) {
      if (inWeek(r.day)) active.set(r.userId, r.isGuest);
    }
    const usage = input.usage.filter((u) => inWeek(utcDay(u.createdAt)));
    const askers = new Set(usage.map((u) => u.userId).filter(Boolean));
    const costed = usage.filter((u) => u.costUsd != null);
    const costUsd = costed.reduce((s, u) => s + (u.costUsd ?? 0), 0);
    const activeGuests = [...active.values()].filter(Boolean).length;

    weeks.push({
      start,
      end,
      activeUsers: active.size,
      activeSignedIn: active.size - activeGuests,
      activeGuests,
      questions: usage.length,
      askers: askers.size,
      questionsPerActiveUser: ratio(usage.length, active.size),
      questionsPerAsker: ratio(usage.length, askers.size),
      costUsd,
      costPerQuestionUsd: ratio(costUsd, costed.length),
      costCoverage: ratio(costed.length, usage.length),
      toolCallsPerQuestion: ratio(
        usage.reduce((s, u) => s + u.toolCalls, 0),
        usage.length,
      ),
      tokensPerQuestion: ratio(
        usage.reduce((s, u) => s + u.totalTokens, 0),
        usage.length,
      ),
    });
  }

  const daily: ProductMetrics["daily"] = [];
  for (let d = 13; d >= 0; d--) {
    const day = dayOffset(now, d);
    daily.push({
      day,
      activeUsers: new Set(
        input.activeDays.filter((r) => r.day === day).map((r) => r.userId),
      ).size,
      questions: input.usage.filter((u) => utcDay(u.createdAt) === day).length,
    });
  }

  const weekStart = dayOffset(now, 6);
  const thisWeek = (d: Date) => utcDay(d) >= weekStart;

  const sourceUsers = new Map<string, Set<string>>();
  for (const r of input.activeDays) {
    if (r.day < weekStart) continue;
    const key = r.source ?? "direct";
    if (!sourceUsers.has(key)) sourceUsers.set(key, new Set());
    sourceUsers.get(key)!.add(r.userId);
  }
  const newAccounts = new Map<string, number>();
  const eventCounts = new Map<string, { count: number; users: Set<string> }>();
  const blocked = new Map<string, number>();
  for (const e of input.events) {
    if (!thisWeek(e.createdAt)) continue;
    const entry = eventCounts.get(e.name) ?? { count: 0, users: new Set<string>() };
    entry.count++;
    if (e.userId) entry.users.add(e.userId);
    eventCounts.set(e.name, entry);
    if (e.name === "account_created" || e.name === "guest_created") {
      const key = e.source ?? "direct";
      newAccounts.set(key, (newAccounts.get(key) ?? 0) + 1);
    }
    if (e.name === "chat_blocked") {
      const reason = propString(e.props, "reason") ?? "unknown";
      blocked.set(reason, (blocked.get(reason) ?? 0) + 1);
    }
  }
  const sourceKeys = new Set([...sourceUsers.keys(), ...newAccounts.keys()]);

  return {
    generatedAt: now.toISOString(),
    weeks,
    daily,
    sourcesThisWeek: [...sourceKeys]
      .map((source) => ({
        source,
        activeUsers: sourceUsers.get(source)?.size ?? 0,
        newAccounts: newAccounts.get(source) ?? 0,
      }))
      .sort((a, b) => b.activeUsers - a.activeUsers || b.newAccounts - a.newAccounts),
    eventsThisWeek: [...eventCounts.entries()]
      .map(([name, v]) => ({ name, count: v.count, users: v.users.size }))
      .sort((a, b) => b.count - a.count),
    blockedThisWeek: [...blocked.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function loadProductMetrics(options?: {
  now?: Date;
  weeks?: number;
}): Promise<ProductMetrics> {
  const now = options?.now ?? new Date();
  const weeks = Math.min(Math.max(options?.weeks ?? 8, 1), 26);
  const firstDay = dayOffset(now, weeks * 7 - 1);
  const since = new Date(`${firstDay}T00:00:00.000Z`);

  const [activeDays, usage, events] = await Promise.all([
    prisma.activeDay.findMany({
      where: { day: { gte: firstDay } },
      select: { userId: true, day: true, isGuest: true, source: true },
    }),
    prisma.chatUsage.findMany({
      where: { createdAt: { gte: since } },
      select: {
        userId: true,
        isGuest: true,
        createdAt: true,
        costUsd: true,
        toolCalls: true,
        totalTokens: true,
      },
    }),
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      select: { name: true, userId: true, createdAt: true, source: true, props: true },
    }),
  ]);

  return summarizeMetrics({ now, weeks, activeDays, usage, events });
}

// ── Admin gate ────────────────────────────────────────────────────────────

/** ADMIN_EMAILS: comma-separated, case-insensitive. Empty → nobody. */
export function adminEmailsFromEnv(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when the user is a verified, non-guest account listed in ADMIN_EMAILS. */
export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const admins = adminEmailsFromEnv();
  if (admins.size === 0) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true, isGuest: true },
  });
  if (!user || user.isGuest || !user.emailVerified || !user.email) return false;
  return admins.has(user.email.toLowerCase());
}
