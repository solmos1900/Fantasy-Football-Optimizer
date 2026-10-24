/**
 * Unit guard: chat rate-limit decisions.
 * Run: npx tsx scripts/verify-chat-rate-limit.ts
 */

import assert from "node:assert/strict";
import {
  CHAT_GUEST_DAILY_LIMIT,
  CHAT_USER_DAILY_LIMIT,
} from "../src/lib/chat/config";
import {
  evaluateRateLimitCount,
  guestBucketKey,
  utcDayKey,
  userBucketKey,
} from "../src/lib/chat/rate-limit";

assert.ok(CHAT_GUEST_DAILY_LIMIT >= 10 && CHAT_GUEST_DAILY_LIMIT <= 40);
assert.ok(CHAT_USER_DAILY_LIMIT > CHAT_GUEST_DAILY_LIMIT);

const day = utcDayKey(new Date("2026-10-23T15:00:00.000Z"));
assert.equal(day, "2026-10-23");

const guestOk = evaluateRateLimitCount(0, "guest", day);
assert.equal(guestOk.allowed, true);
assert.equal(guestOk.remaining, CHAT_GUEST_DAILY_LIMIT);

const guestBlocked = evaluateRateLimitCount(CHAT_GUEST_DAILY_LIMIT, "guest", day);
assert.equal(guestBlocked.allowed, false);
assert.match(guestBlocked.message ?? "", /guest limit/i);

const userBlocked = evaluateRateLimitCount(CHAT_USER_DAILY_LIMIT, "user", day);
assert.equal(userBlocked.allowed, false);
assert.match(userBlocked.message ?? "", /chat limit/i);

const g1 = guestBucketKey("1.2.3.4", "sess-a");
const g2 = guestBucketKey("1.2.3.4", "sess-a");
const g3 = guestBucketKey("9.9.9.9", "sess-a");
assert.equal(g1, g2);
assert.notEqual(g1, g3);
assert.match(g1, /^guest:/);
assert.match(userBucketKey("user_123"), /^user:user_123$/);

console.log("verify-chat-rate-limit: ok");
