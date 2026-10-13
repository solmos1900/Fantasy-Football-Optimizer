/**
 * Regression guard for guest TTL helpers + cleanup auth expectations (no DB).
 *
 * Run: npx tsx scripts/verify-ephemeral-cleanup.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CACHED_PAYLOAD_MAX_CHARS,
  DEFAULT_GUEST_TTL_HOURS,
  guestTtlHoursFromEnv,
} from "../src/lib/cleanup/constants";

const prev = process.env.GUEST_SESSION_TTL_HOURS;

delete process.env.GUEST_SESSION_TTL_HOURS;
assert.equal(guestTtlHoursFromEnv(), DEFAULT_GUEST_TTL_HOURS);

process.env.GUEST_SESSION_TTL_HOURS = "12";
assert.equal(guestTtlHoursFromEnv(), 12);

process.env.GUEST_SESSION_TTL_HOURS = "0";
assert.equal(guestTtlHoursFromEnv(), DEFAULT_GUEST_TTL_HOURS);

process.env.GUEST_SESSION_TTL_HOURS = "not-a-number";
assert.equal(guestTtlHoursFromEnv(), DEFAULT_GUEST_TTL_HOURS);

process.env.GUEST_SESSION_TTL_HOURS = "99999";
assert.equal(guestTtlHoursFromEnv(), 24 * 30);

assert.ok(CACHED_PAYLOAD_MAX_CHARS > 100_000);

const vercelJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
) as { crons?: { path: string; schedule: string }[] };

assert.ok(Array.isArray(vercelJson.crons));
const cleanupCron = vercelJson.crons.find((c) => c.path === "/api/cron/cleanup");
assert.ok(cleanupCron, "vercel.json must schedule /api/cron/cleanup");
assert.match(cleanupCron.schedule, /^\S+ \S+ \S+ \S+ \S+$/);

const nflverseCrons = vercelJson.crons.filter(
  (c) => c.path === "/api/cron/nflverse-usage",
);
assert.ok(
  nflverseCrons.length >= 2,
  "nflverse cron should run after MNF (Tue) and again Wed for late publishes",
);

const cronRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/cleanup/route.ts"),
  "utf8",
);
assert.match(cronRoute, /CRON_SECRET/);
assert.match(cronRoute, /Bearer/);

const endSession = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/guest/end-session/route.ts"),
  "utf8",
);
assert.match(endSession, /deleteGuestUserById/);
assert.match(endSession, /isGuest/);

const trends = fs.readFileSync(
  path.join(process.cwd(), "src/lib/insights/trends.ts"),
  "utf8",
);
assert.match(trends, /leagueId === "demo-league"/);

const service = fs.readFileSync(
  path.join(process.cwd(), "src/lib/league/service.ts"),
  "utf8",
);
assert.doesNotMatch(service, /getFreshDemoSourceLeague/);
assert.doesNotMatch(service, /connectDemoLeague/);

if (prev === undefined) delete process.env.GUEST_SESSION_TTL_HOURS;
else process.env.GUEST_SESSION_TTL_HOURS = prev;

console.log("verify-ephemeral-cleanup: ok");
console.log(
  `  defaultTtl=${DEFAULT_GUEST_TTL_HOURS}h cron=${cleanupCron.schedule} nflverseCrons=${nflverseCrons.length} payloadCap=${CACHED_PAYLOAD_MAX_CHARS}`,
);
