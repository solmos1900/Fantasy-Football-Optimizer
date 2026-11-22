/**
 * Unit guard: the chat API accepts the conversation ids its own clients send.
 * Guest chats use browser-local "guest-<uuid>" ids (newGuestConversationId);
 * rejecting them made every guest chat message fail with "Invalid request".
 * Run: npm run verify:chat-request
 */

import assert from "node:assert/strict";
import { chatRequestSchema, GUEST_CONVERSATION_ID_RE } from "../src/lib/chat/request";
import { newGuestConversationId } from "../src/lib/chat/guest-store";

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

console.log("verify:chat-request OK");
