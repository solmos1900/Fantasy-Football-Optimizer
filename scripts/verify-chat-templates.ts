/**
 * Unit guard: chat template payloads.
 * Run: npx tsx scripts/verify-chat-templates.ts
 */

import assert from "node:assert/strict";
import {
  CHAT_TEMPLATES,
  chatTemplatePayloadSchema,
  templateUserText,
} from "../src/lib/chat/templates";

assert.ok(CHAT_TEMPLATES.length >= 4);
assert.ok(CHAT_TEMPLATES.some((t) => t.id === "trade"));
assert.ok(CHAT_TEMPLATES.some((t) => t.id === "who-to-start"));
assert.ok(CHAT_TEMPLATES.some((t) => t.id === "waiver"));
assert.ok(CHAT_TEMPLATES.some((t) => t.id === "outlook"));

const trade = chatTemplatePayloadSchema.parse({
  type: "trade",
  left: [
    { espnId: 1, name: "Puka Nacua", nflTeam: "LAR", position: "WR" },
    { espnId: 2, name: "Kyren Williams", nflTeam: "LAR", position: "RB" },
  ],
  right: [
    { espnId: 3, name: "Ja'Marr Chase", nflTeam: "CIN", position: "WR" },
    { espnId: 4, name: "Chase Brown", nflTeam: "CIN", position: "RB" },
  ],
});
assert.equal(trade.type, "trade");
assert.equal(trade.left.length, 2);
assert.equal(trade.right.length, 2);
assert.match(templateUserText(trade), /Puka Nacua \(LAR\)/);
assert.match(templateUserText(trade), /Ja'Marr Chase \(CIN\)/);

const wts = chatTemplatePayloadSchema.parse({
  type: "who-to-start",
  players: [
    { espnId: 10, name: "Amon-Ra St. Brown", nflTeam: "DET" },
    { espnId: 11, name: "DK Metcalf", nflTeam: "PIT" },
    { espnId: 12, name: "Garrett Wilson", nflTeam: "NYJ" },
  ],
});
assert.equal(wts.type, "who-to-start");
if (wts.type === "who-to-start") {
  assert.equal(wts.players.length, 3);
}

assert.throws(() =>
  chatTemplatePayloadSchema.parse({
    type: "who-to-start",
    players: [{ espnId: 1, name: "Solo" }],
  }),
);

assert.throws(() =>
  chatTemplatePayloadSchema.parse({
    type: "trade",
    left: [],
    right: [{ espnId: 1, name: "A", nflTeam: "LAR" }],
  }),
);

console.log("verify-chat-templates: ok");
