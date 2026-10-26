/**
 * Unit guard: @-mention search / chip tokens.
 * Run: npx tsx scripts/verify-chat-mention-search.ts
 */

import assert from "node:assert/strict";
import {
  encodeReadableMentions,
  extractMentionQuery,
  insertMentionChip,
  insertReadableMention,
  mentionChipsToDisplay,
  mentionSearchAnchor,
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
  { espnId: 6, name: "A.J. Brown", position: "WR", nflTeam: "NE" },
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

// Initials with periods match with or without them, in any word order.
assert.equal(normalizeSearchText("A.J. Brown"), "aj brown");
assert.ok(matchesMentionQuery(pool[5]!, "aj brown"));
assert.ok(matchesMentionQuery(pool[5]!, "brown a.j."));
assert.equal(rankMentionHits(pool, "aj brown", 3)[0]?.espnId, 6);

// DB prefilter anchor: longest clean word.
assert.equal(mentionSearchAnchor("aj brown"), "brown");
assert.equal(mentionSearchAnchor("Puka"), "Puka");
assert.equal(mentionSearchAnchor("ja'marr"), "ja'marr");
assert.equal(mentionSearchAnchor("@"), null);

// Composer shows readable mentions; ids are encoded only on send.
{
  let text = "Start @pu";
  let m = extractMentionQuery(text, text.length)!;
  const first = insertReadableMention(text, m.start, m.end, pool[0]!);
  assert.equal(first.text, "Start @Puka Nacua (LAR) ");
  text = `${first.text}or @aj`;
  const labels = [first.label];
  // The finished mention must not reopen the typeahead…
  assert.equal(extractMentionQuery(first.text, first.cursor, labels), null);
  // …but a new @ after it does.
  m = extractMentionQuery(text, text.length, labels)!;
  assert.equal(m.query, "aj");
  const second = insertReadableMention(text, m.start, m.end, pool[5]!);
  assert.equal(second.text, "Start @Puka Nacua (LAR) or @A.J. Brown (NE) ");
  assert.equal(
    extractMentionQuery(second.text, second.cursor, [...labels, second.label]),
    null,
  );

  const encoded = encodeReadableMentions(second.text.trim(), [
    { espnId: 1, label: first.label },
    { espnId: 6, label: second.label },
    { espnId: 99, label: "Deleted Player (FA)" },
  ]);
  assert.equal(
    encoded.text,
    "Start @[1|Puka Nacua (LAR)] or @[6|A.J. Brown (NE)]",
  );
  assert.deepEqual(encoded.espnIds.sort(), [1, 6]);
  assert.equal(
    mentionChipsToDisplay(encoded.text),
    "Start Puka Nacua (LAR) or A.J. Brown (NE)",
  );
}

// Legacy encoded chip right before the cursor is not an active query.
assert.equal(
  extractMentionQuery("@[6|A.J. Brown (NE)] ", 21),
  null,
);
// Runaway text after a stray @ stops searching.
assert.equal(extractMentionQuery(`@${"x".repeat(60)}`, 61), null);

console.log("verify-chat-mention-search: ok");
