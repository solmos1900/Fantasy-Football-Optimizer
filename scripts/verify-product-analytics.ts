/**
 * Unit guard: product analytics + launch metrics (no network / DB).
 * - Attribution source normalization (utm/ref cookie)
 * - Client event allowlist
 * - Cost per question from tokens × pricing (cached input, unknown pricing)
 * - Weekly aggregation: WAU, questions per user, cost per question, sources
 * Run: npm run verify:product-analytics
 */

import assert from "node:assert/strict";
import {
  attributionFromCookieHeader,
  isClientAnalyticsEvent,
  normalizeAttributionSource,
  utcDay,
} from "../src/lib/analytics/events";
import { costFromUsage, pricingFromEnv } from "../src/lib/chat/pricing";
import { adminEmailsFromEnv, summarizeMetrics } from "../src/lib/analytics/metrics";

// ── Attribution ───────────────────────────────────────────────────────────
assert.equal(normalizeAttributionSource("Reddit"), "reddit");
assert.equal(normalizeAttributionSource("reddit%3Aplayoffpush"), "reddit:playoffpush");
assert.equal(normalizeAttributionSource("league.smith-2026"), "league.smith-2026");
assert.equal(normalizeAttributionSource("<script>"), null);
assert.equal(normalizeAttributionSource("a b"), null);
assert.equal(normalizeAttributionSource("%E0%A4%A"), null, "bad escape");
assert.equal(normalizeAttributionSource("x".repeat(41)), null);
assert.equal(normalizeAttributionSource(""), null);
assert.equal(
  attributionFromCookieHeader("foo=1; giq_src=reddit%3Aplayoffpush; bar=2"),
  "reddit:playoffpush",
);
assert.equal(attributionFromCookieHeader("foo=1"), null);
assert.equal(attributionFromCookieHeader(null), null);

// ── Client allowlist ──────────────────────────────────────────────────────
assert.ok(isClientAnalyticsEvent("trade_analyzed"));
assert.ok(isClientAnalyticsEvent("chat_template_used"));
assert.ok(!isClientAnalyticsEvent("account_created"), "server-only events rejected");
assert.ok(!isClientAnalyticsEvent("chat_blocked"));
assert.ok(!isClientAnalyticsEvent(42));

// ── Pricing / cost ────────────────────────────────────────────────────────
assert.equal(pricingFromEnv({}), null);
assert.equal(pricingFromEnv({ CHAT_PRICE_INPUT_PER_MTOK_USD: "1" }), null, "both required");
const envPricing = pricingFromEnv({
  CHAT_PRICE_INPUT_PER_MTOK_USD: "0.30",
  CHAT_PRICE_OUTPUT_PER_MTOK_USD: "2.50",
});
assert.ok(envPricing);
const close = (a: number | null, b: number) =>
  assert.ok(a != null && Math.abs(a - b) < 1e-12, `${a} ≈ ${b}`);
close(costFromUsage({ inputTokens: 1_000_000, outputTokens: 0 }, envPricing), 0.3);
close(costFromUsage({ inputTokens: 10_000, outputTokens: 1_000 }, envPricing), 0.003 + 0.0025);
// Cached input priced at the cached rate; cached > input is clamped.
const cachedPricing = { input: 1e-6, output: 2e-6, cachedInput: 0.25e-6, source: "gateway" as const };
close(costFromUsage({ inputTokens: 1000, outputTokens: 0, cachedInputTokens: 800 }, cachedPricing), 200e-6 + 200e-6);
close(costFromUsage({ inputTokens: 100, outputTokens: 0, cachedInputTokens: 500 }, cachedPricing), 25e-6);
assert.equal(costFromUsage({ inputTokens: 10, outputTokens: 10 }, null), null, "unknown pricing → null");
assert.equal(costFromUsage({ outputTokens: 10 }, envPricing), null, "unknown tokens → null");

// ── Admin gate parsing ────────────────────────────────────────────────────
assert.deepEqual([...adminEmailsFromEnv({ ADMIN_EMAILS: " A@x.com, b@y.com ,," })], ["a@x.com", "b@y.com"]);
assert.equal(adminEmailsFromEnv({}).size, 0);

// ── Weekly aggregation ────────────────────────────────────────────────────
const now = new Date("2026-11-10T15:00:00Z");
assert.equal(utcDay(now), "2026-11-10");
const at = (day: string) => new Date(`${day}T12:00:00Z`);
const m = summarizeMetrics({
  now,
  weeks: 2,
  activeDays: [
    // this week (11-04 .. 11-10): u1 twice (counted once), u2 guest, u3
    { userId: "u1", day: "2026-11-10", isGuest: false, source: "reddit:playoffpush" },
    { userId: "u1", day: "2026-11-09", isGuest: false, source: "reddit:playoffpush" },
    { userId: "g2", day: "2026-11-04", isGuest: true, source: null },
    { userId: "u3", day: "2026-11-06", isGuest: false, source: "league" },
    // previous week (10-28 .. 11-03)
    { userId: "u1", day: "2026-11-03", isGuest: false, source: "reddit:playoffpush" },
    // outside both windows
    { userId: "old", day: "2026-10-27", isGuest: false, source: null },
  ],
  usage: [
    { userId: "u1", isGuest: false, createdAt: at("2026-11-10"), costUsd: 0.002, toolCalls: 2, totalTokens: 3000 },
    { userId: "u1", isGuest: false, createdAt: at("2026-11-09"), costUsd: 0.004, toolCalls: 1, totalTokens: 5000 },
    { userId: "g2", isGuest: true, createdAt: at("2026-11-04"), costUsd: null, toolCalls: 0, totalTokens: 1000 },
    { userId: "u1", isGuest: false, createdAt: at("2026-11-02"), costUsd: 0.01, toolCalls: 3, totalTokens: 9000 },
  ],
  events: [
    { name: "account_created", userId: "u3", createdAt: at("2026-11-06"), source: "league", props: { method: "email" } },
    { name: "guest_created", userId: "g2", createdAt: at("2026-11-04"), source: null, props: null },
    { name: "trade_analyzed", userId: "u1", createdAt: at("2026-11-09"), source: null, props: { mode: "free" } },
    { name: "trade_analyzed", userId: "u1", createdAt: at("2026-11-10"), source: null, props: { mode: "free" } },
    { name: "chat_blocked", userId: "g2", createdAt: at("2026-11-05"), source: null, props: { reason: "guest_cap" } },
    { name: "trade_analyzed", userId: "u1", createdAt: at("2026-10-20"), source: null, props: null },
  ],
});
const [w0, w1] = m.weeks;
assert.equal(w0!.start, "2026-11-04");
assert.equal(w0!.end, "2026-11-10");
assert.equal(w0!.activeUsers, 3);
assert.equal(w0!.activeSignedIn, 2);
assert.equal(w0!.activeGuests, 1);
assert.equal(w0!.questions, 3);
assert.equal(w0!.askers, 2);
close(w0!.questionsPerActiveUser, 1);
close(w0!.questionsPerAsker, 1.5);
close(w0!.costUsd, 0.006);
close(w0!.costPerQuestionUsd, 0.003); // mean over the 2 priced turns
close(w0!.costCoverage, 2 / 3);
close(w0!.toolCallsPerQuestion, 1);
assert.equal(w1!.start, "2026-10-28");
assert.equal(w1!.activeUsers, 1);
assert.equal(w1!.questions, 1);
close(w1!.costPerQuestionUsd, 0.01);

assert.equal(m.daily.length, 14);
assert.equal(m.daily.at(-1)!.day, "2026-11-10");
assert.equal(m.daily.at(-1)!.activeUsers, 1);
assert.equal(m.daily.at(-1)!.questions, 1);

const reddit = m.sourcesThisWeek.find((s) => s.source === "reddit:playoffpush");
assert.deepEqual(reddit, { source: "reddit:playoffpush", activeUsers: 1, newAccounts: 0 });
assert.deepEqual(m.sourcesThisWeek.find((s) => s.source === "league"), {
  source: "league",
  activeUsers: 1,
  newAccounts: 1,
});
assert.deepEqual(m.sourcesThisWeek.find((s) => s.source === "direct"), {
  source: "direct",
  activeUsers: 1,
  newAccounts: 1,
});
assert.deepEqual(m.eventsThisWeek[0], { name: "trade_analyzed", count: 2, users: 1 });
assert.deepEqual(m.blockedThisWeek, [{ reason: "guest_cap", count: 1 }]);

// Empty input: ratios are null, not NaN/0.
const empty = summarizeMetrics({ now, weeks: 1, activeDays: [], usage: [], events: [] });
assert.equal(empty.weeks[0]!.questionsPerActiveUser, null);
assert.equal(empty.weeks[0]!.costPerQuestionUsd, null);
assert.equal(empty.weeks[0]!.costCoverage, null);

console.log("verify:product-analytics OK");
