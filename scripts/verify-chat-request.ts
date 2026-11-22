/**
 * Unit guard: the chat API accepts the conversation ids its own clients send.
 * Guest chats use browser-local "guest-<uuid>" ids (newGuestConversationId);
 * rejecting them made every guest chat message fail with "Invalid request".
 * Run: npm run verify:chat-request
 */

import assert from "node:assert/strict";
import { chatRequestSchema, GUEST_CONVERSATION_ID_RE } from "../src/lib/chat/request";
import { newGuestConversationId } from "../src/lib/chat/guest-store";
import {
  CHAT_BUSY_NOTICE,
  CHAT_GATEWAY_UNAVAILABLE_NOTICE,
  chatAvailable,
  gatewayConfigured,
} from "../src/lib/chat/config";
import { streamErrorText } from "../src/lib/chat/stream-errors";

const msg = [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }];
const ok = (conversationId: unknown) =>
  chatRequestSchema.safeParse({ messages: msg, conversationId }).success;

// What the guest client actually sends.
for (let i = 0; i < 20; i++) {
  const id = newGuestConversationId();
  assert.ok(GUEST_CONVERSATION_ID_RE.test(id), id);
  assert.ok(ok(id), `guest id accepted: ${id}`);
}
// Signed-in stored conversation (cuid), new conversation (null / absent).
assert.ok(ok("cmh2x9k0p0000abcd1234efgh"));
assert.ok(ok(null));
assert.ok(chatRequestSchema.safeParse({ messages: msg }).success);
// Anything else is still rejected.
assert.ok(!ok("guest-not-a-uuid"));
assert.ok(!ok("../../etc/passwd"));
assert.ok(!ok("x".repeat(200)));
assert.ok(!ok(42));

// ── Gateway availability ──
// On Vercel the OIDC token is a request header, not an env var: VERCEL=1 alone
// must count as configured (it read as "unavailable" in production before).
assert.ok(gatewayConfigured({ VERCEL: "1" }));
assert.ok(gatewayConfigured({ AI_GATEWAY_API_KEY: "k" }));
assert.ok(gatewayConfigured({ VERCEL_OIDC_TOKEN: "t" }));
assert.ok(!gatewayConfigured({}), "local dev without a key");
assert.ok(chatAvailable({ VERCEL: "1" }));
assert.ok(chatAvailable({ VERCEL: "1", CHAT_DISABLED: "0" }));
assert.ok(!chatAvailable({ VERCEL: "1", CHAT_DISABLED: "1" }));
assert.ok(!chatAvailable({ VERCEL: "1", CHAT_DISABLED: "true" }));
assert.ok(!chatAvailable({}));

// ── Mid-stream errors: busy vs unavailable, never a bare "An error occurred." ──
const rl = new Error("Rate limit exceeded for google/gemini-2.5-flash: this team's limit of 5 requests per minute was reached.");
rl.name = "GatewayRateLimitError";
assert.equal(JSON.parse(streamErrorText(rl)).notice, CHAT_BUSY_NOTICE);
assert.equal(JSON.parse(streamErrorText(new Error("HTTP 429 Too Many Requests"))).notice, CHAT_BUSY_NOTICE);
assert.equal(
  JSON.parse(streamErrorText(new Error("Free tier users do not have access to this model."))).notice,
  CHAT_GATEWAY_UNAVAILABLE_NOTICE,
);
assert.equal(JSON.parse(streamErrorText("boom")).notice, CHAT_GATEWAY_UNAVAILABLE_NOTICE);
// Users never see env var names.
assert.doesNotMatch(CHAT_GATEWAY_UNAVAILABLE_NOTICE, /AI_GATEWAY|OIDC/);

console.log("verify:chat-request OK");
