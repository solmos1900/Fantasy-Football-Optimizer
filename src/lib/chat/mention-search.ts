/**
 * Fast @-mention player typeahead over our own player rows / pool.
 * Pure matching helpers — API loads candidates; UI/tests call these.
 *
 * Chips always use full name + NFL team (never last-name-only / WR2).
 * Handles Jr./Sr./II/III/IV and apostrophes (e.g. Ja'Marr Chase).
 */

import { formatPlayerLabel } from "@/lib/insights/player-label";

export type MentionPlayer = {
  /** Stable ESPN id — chips carry this so the server never guesses from text. */
  espnId: number;
  name: string;
  position: string;
  nflTeam: string | null;
};

export type MentionHit = MentionPlayer & {
  label: string;
};

/** Strip punctuation / normalize for fuzzy includes (keeps letters & digits). */
export function normalizeSearchText(raw: string): string {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`.]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Longest @-query we still treat as a live search (stops runaway popups). */
const MAX_MENTION_QUERY_CHARS = 40;

const CHIP_TOKEN_AT_START_RE = /^\[\d+\|[^\]]*\]/;

/**
 * Extract the active @-query from composer text.
 * Returns null when the cursor is not inside an @ mention token, including
 * when the @ belongs to a mention that is already completed — either an
 * encoded chip token or a readable label from `completedLabels`.
 */
export function extractMentionQuery(
  text: string,
  cursor: number,
  completedLabels: readonly string[] = [],
): { query: string; start: number; end: number } | null {
  const upto = text.slice(0, Math.max(0, cursor));
  const at = upto.lastIndexOf("@");
  if (at < 0) return null;
  // @ must start a token (start or whitespace before)
  if (at > 0 && !/\s/.test(upto[at - 1]!)) return null;
  const after = upto.slice(at + 1);
  // Stop at newline; allow spaces/apostrophes/hyphens/periods for "Puka Nacua" / "Odell Beckham Jr."
  if (/[\n]/.test(after)) return null;
  // Closed by another @ without space → not active
  if (after.includes("@")) return null;
  // A finished mention is not a search (was showing "No players match [id|…]").
  if (CHIP_TOKEN_AT_START_RE.test(after)) return null;
  if (completedLabels.some((label) => label && after.startsWith(label))) {
    return null;
  }
  if (after.length > MAX_MENTION_QUERY_CHARS) return null;
  return { query: after, start: at, end: cursor };
}

/**
 * Word used to prefilter DB candidates: the longest token of the normalised
 * query (2+ chars). Apostrophes are dropped by normalisation, so "ja'marr"
 * anchors on "jamarr" — the DB still stores "Ja'Marr"; fall back to the raw
 * longest word when the normalised one would not appear in stored names.
 */
export function mentionSearchAnchor(rawQuery: string): string | null {
  const rawWords = rawQuery
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length >= 2);
  // Prefer a word with no inner punctuation (matches DB names verbatim).
  const clean = rawWords.filter((w) => /^[\p{L}\p{N}]+$/u.test(w));
  const pool = clean.length ? clean : rawWords;
  if (!pool.length) return null;
  return pool.reduce((a, b) => (b.length > a.length ? b : a));
}

export function matchesMentionQuery(
  player: MentionPlayer,
  rawQuery: string,
): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const label = formatPlayerLabel(player.name, player.nflTeam);
  const hay = normalizeSearchText(
    [label, player.name, player.nflTeam ?? "", player.position].join(" "),
  );
  // All query tokens must appear (order-independent) for multi-word names.
  const tokens = q.split(" ").filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

export function rankMentionHits(
  players: MentionPlayer[],
  rawQuery: string,
  limit = 8,
): MentionHit[] {
  const q = normalizeSearchText(rawQuery);
  const hits: MentionHit[] = [];
  for (const p of players) {
    if (!matchesMentionQuery(p, rawQuery)) continue;
    const label = formatPlayerLabel(p.name, p.nflTeam);
    hits.push({ ...p, label });
  }
  hits.sort((a, b) => {
    const an = normalizeSearchText(a.name);
    const bn = normalizeSearchText(b.name);
    // Prefer prefix matches on full name, then shorter names, then alpha.
    const aPrefix = q && an.startsWith(q) ? 0 : 1;
    const bPrefix = q && bn.startsWith(q) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    if (an.length !== bn.length) return an.length - bn.length;
    return an.localeCompare(bn);
  });
  return hits.slice(0, limit);
}

/** Insert a chip token after replacing the @query span. */
export function insertMentionChip(
  text: string,
  start: number,
  end: number,
  player: MentionPlayer,
): { text: string; cursor: number; chipToken: string } {
  const label = formatPlayerLabel(player.name, player.nflTeam);
  // Opaque token: @[espnId|Full Name (TEAM)]
  const chipToken = `@[${player.espnId}|${label}]`;
  const next = `${text.slice(0, start)}${chipToken} ${text.slice(end)}`;
  const cursor = start + chipToken.length + 1;
  return { text: next, cursor, chipToken };
}

/**
 * Insert a readable mention (`@Full Name (TEAM) `) for the composer. The
 * caller keeps the player id and converts to chip tokens on send with
 * encodeReadableMentions — users never see raw `@[id|…]` tokens.
 */
export function insertReadableMention(
  text: string,
  start: number,
  end: number,
  player: MentionPlayer,
): { text: string; cursor: number; label: string } {
  const label = formatPlayerLabel(player.name, player.nflTeam);
  const inserted = `@${label} `;
  return {
    text: `${text.slice(0, start)}${inserted}${text.slice(end)}`,
    cursor: start + inserted.length,
    label,
  };
}

/**
 * Turn readable `@Label` mentions back into `@[espnId|Label]` chip tokens
 * (the wire format the server and message list understand). Mentions the
 * user deleted from the text are dropped from the returned ids.
 */
export function encodeReadableMentions(
  text: string,
  mentions: readonly { espnId: number; label: string }[],
): { text: string; espnIds: number[] } {
  let out = text;
  const espnIds: number[] = [];
  // Longest labels first so "A.J. Brown (PHI)" never half-matches a prefix.
  const sorted = [...mentions].sort((a, b) => b.label.length - a.label.length);
  for (const m of sorted) {
    const readable = `@${m.label}`;
    if (!out.includes(readable)) continue;
    out = out.split(readable).join(`@[${m.espnId}|${m.label}]`);
    if (!espnIds.includes(m.espnId)) espnIds.push(m.espnId);
  }
  return { text: out, espnIds };
}

const CHIP_RE = /@\[(\d+)\|([^\]]+)\]/g;

export type ParsedMention = {
  espnId: number;
  label: string;
  raw: string;
};

export function parseMentionChips(text: string): ParsedMention[] {
  const out: ParsedMention[] = [];
  for (const m of text.matchAll(CHIP_RE)) {
    const espnId = Number(m[1]);
    if (!Number.isFinite(espnId)) continue;
    out.push({ espnId, label: m[2] ?? "", raw: m[0] ?? "" });
  }
  return out;
}

/** Plain display text with chip tokens → readable labels. */
export function mentionChipsToDisplay(text: string): string {
  return text.replace(CHIP_RE, (_full, _id, label: string) => label);
}
