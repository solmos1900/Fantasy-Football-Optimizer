/**
 * Unit guard: @-mention search / chip tokens.
 * Run: npx tsx scripts/verify-chat-mention-search.ts
 */

import assert from "node:assert/strict";
import {
  extractMentionQuery,
  insertMentionChip,
  matchesMentionQuery,
  normalizeSearchText,
  parseMentionChips,
  rankMentionHits,
  type MentionPlayer,
} from "../src/lib/chat/mention-search";

const pool: MentionPlayer[] = [
  { espnId: 1, name: "Puka Nacua", position: "WR", nflTeam: "LAR" },
  { espnId: 2, name: "Ja'Marr Chase", position: "WR", nflTeam: "CIN" },
  { espnId: 3, name: "Odell Beckham Jr.", position: "WR", nflTeam: "FA" },
  { espnId: 4, name: "Kenneth Walker III", position: "RB", nflTeam: "SEA" },
  { espnId: 5, name: "Brian Robinson Jr.", position: "RB", nflTeam: "SF" },
];

// Apostrophes / suffixes normalize away for matching
assert.equal(normalizeSearchText("Ja'Marr"), "jamarr");
assert.equal(normalizeSearchText("Odell Beckham Jr."), "odell beckham");
assert.equal(normalizeSearchText("Kenneth Walker III"), "kenneth walker");

assert.ok(matchesMentionQuery(pool[1]!, "jamarr"));
assert.ok(matchesMentionQuery(pool[1]!, "ja'marr"));
assert.ok(matchesMentionQuery(pool[1]!, "chase cin"));
assert.ok(matchesMentionQuery(pool[3]!, "walker iii"));
assert.ok(matchesMentionQuery(pool[3]!, "kenneth walker"));
assert.ok(matchesMentionQuery(pool[0]!, "puka"));
assert.ok(matchesMentionQuery(pool[0]!, "nacua lar"));

const hits = rankMentionHits(pool, "puka", 5);
assert.equal(hits[0]?.espnId, 1);
assert.equal(hits[0]?.label, "Puka Nacua (LAR)");
assert.ok(!/WR2|Nacua$/.test(hits[0]!.label));

// Extract @ query at cursor
{
  const text = "Start @puka tonight";
  const at = text.indexOf("@");
  const q = extractMentionQuery(text, at + 5);
  assert.ok(q);
  assert.equal(q!.query, "puka");
  assert.equal(q!.start, at);
}

// Chip insert carries espn id
{
  const text = "Trade @pu";
  const mention = extractMentionQuery(text, text.length)!;
  const next = insertMentionChip(text, mention.start, mention.end, pool[0]!);
  assert.match(next.text, /@\[1\|Puka Nacua \(LAR\)\]/);
  const parsed = parseMentionChips(next.text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.espnId, 1);
  assert.equal(parsed[0]!.label, "Puka Nacua (LAR)");
}

console.log("verify-chat-mention-search: ok");
