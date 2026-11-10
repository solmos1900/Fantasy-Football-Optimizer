/**
 * Pure graders for the chat eval (no network). Tested offline by
 * scripts/verify-chat-eval-grader.ts with oracle and fabricated answers.
 */

import type { EvalCase, ExpectedCall } from "./cases";

export type ObservedCall = { toolName: string; input: unknown };

// ── Tool-call accuracy ────────────────────────────────────────────────────

function idsOf(call: ObservedCall): number[] {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const out: number[] = [];
  for (const key of ["espnIds", "leftEspnIds", "rightEspnIds"]) {
    const v = input[key];
    if (Array.isArray(v)) out.push(...v.filter((n): n is number => typeof n === "number"));
  }
  if (typeof input.espnId === "number") out.push(input.espnId);
  return out;
}

function sameSet(a: number[], b: number[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

function tradeSides(call: ObservedCall): [number[], number[]] | null {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const l = input.leftEspnIds;
  const r = input.rightEspnIds;
  if (!Array.isArray(l) || !Array.isArray(r)) return null;
  return [l as number[], r as number[]];
}

const SINGLE_ID_TOOLS = new Set(["player_outlook", "waiver_outlook"]);

export function callSatisfied(expected: ExpectedCall, calls: ObservedCall[]): boolean {
  const matching = calls.filter((c) => (expected.tool as string[]).includes(c.toolName));
  if (matching.length === 0) return false;
  if (expected.sides) {
    const [a, b] = expected.sides;
    return matching.some((c) => {
      const s = tradeSides(c);
      return (
        s != null &&
        ((sameSet(s[0], a) && sameSet(s[1], b)) || (sameSet(s[0], b) && sameSet(s[1], a)))
      );
    });
  }
  if (expected.ids) {
    if (matching.some((c) => sameSet(idsOf(c), expected.ids!))) return true;
    // Several single-player outlook calls together covering the set.
    const singles = matching.filter((c) => SINGLE_ID_TOOLS.has(c.toolName));
    return singles.length > 1 && sameSet(singles.flatMap(idsOf), expected.ids);
  }
  return true;
}

export type ToolGrade = {
  pass: boolean;
  /** Every expected call satisfied (or allowed no-tool and none made). */
  expectedSatisfied: boolean;
  forbiddenCalls: string[];
  /** Calls beyond what the case needed (reported, not failed). */
  extraCalls: number;
  toolNames: string[];
};

export function gradeToolCalls(c: EvalCase, calls: ObservedCall[]): ToolGrade {
  const expectedSatisfied =
    (c.allowNoTool && calls.length === 0) ||
    c.calls.every((e) => callSatisfied(e, calls));
  const forbid = c.forbid ?? [];
  const forbiddenCalls = calls
    .map((x) => x.toolName)
    .filter((name) => forbid.includes("*") || (forbid as string[]).includes(name));
  const extraCalls = Math.max(0, calls.length - c.calls.length);
  return {
    pass: expectedSatisfied && forbiddenCalls.length === 0,
    expectedSatisfied,
    forbiddenCalls,
    extraCalls,
    toolNames: calls.map((x) => x.toolName),
  };
}

// ── Number grounding (hallucinated stats) ─────────────────────────────────

const CHIP_RE = /@\[(\d+)\|([^\]]+)\]/g;
/** Position-rank labels like WR2 / RB1 — not stats (style rule 4). */
const POS_RANK_RE = /\b(?:QB|RB|WR|TE|K|FLEX|DST|D\/ST)\d+\b/gi;
/**
 * Window labels naming a metric, not stating a value: "last 3 game average",
 * "last-3-game avg", "last 3 outings" (the tools' last-3 average).
 */
const WINDOW_LABEL_RE = /\blast[- ]\d+[- ](?:games?|outings?|weeks?|starts?)\b/gi;
/** Team nickname that contains digits. */
const NAMES_WITH_DIGITS_RE = /\b49ers\b/gi;
const NUMBER_RE = /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s?%)?/g;

export type NumberToken = {
  raw: string;
  value: number;
  decimals: number;
  percent: boolean;
};

export function extractNumbers(text: string): NumberToken[] {
  const cleaned = text
    .replace(CHIP_RE, " ")
    .replace(POS_RANK_RE, " ")
    .replace(WINDOW_LABEL_RE, " ")
    .replace(NAMES_WITH_DIGITS_RE, " ");
  const out: NumberToken[] = [];
  for (const m of cleaned.matchAll(NUMBER_RE)) {
    const intPart = (m[1] ?? "").replace(/,/g, "");
    const frac = m[2] ?? "";
    out.push({
      raw: m[0].trim(),
      value: Number(frac ? `${intPart}.${frac}` : intPart),
      decimals: frac.length,
      percent: Boolean(m[3]),
    });
  }
  return out;
}

/** All numbers in a JSON value: numeric leaves, numbers inside strings, list sizes. */
export function collectSourceNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(value);
  } else if (typeof value === "string") {
    for (const t of extractNumbers(value)) out.push(t.value);
  } else if (Array.isArray(value)) {
    // List sizes are tool facts too ("you have 7 players").
    out.push(value.length);
    for (const v of value) collectSourceNumbers(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectSourceNumbers(v, out);
  }
  return out;
}

function matchesAtPrecision(token: NumberToken, v: number): boolean {
  const tol = 0.5 * 10 ** -token.decimals + 1e-9;
  if (Math.abs(Math.abs(v) - token.value) <= tol) return true;
  // 0.47 in a tool result shown as "47%".
  if (token.percent && Math.abs(Math.abs(v) * 100 - token.value) <= tol) return true;
  return false;
}

export type NumberVerdict = NumberToken & {
  grounded: boolean;
  /** Not in any source but equals a sum/difference of two source values. */
  derivable: boolean;
};

export type NumberGrade = {
  numbers: NumberVerdict[];
  hallucinated: NumberVerdict[];
};

export function gradeNumbers(
  text: string,
  sources: { toolResults: unknown[]; prompt: string; systemContext: string },
): NumberGrade {
  const values = [
    ...collectSourceNumbers(sources.toolResults),
    ...collectSourceNumbers(sources.prompt),
    ...collectSourceNumbers(sources.systemContext),
  ];
  const unique = [...new Set(values.map((v) => Math.round(v * 1e6) / 1e6))];
  const numbers = extractNumbers(text).map((token) => {
    const grounded = unique.some((v) => matchesAtPrecision(token, v));
    let derivable = false;
    if (!grounded) {
      const pool = unique.slice(0, 400);
      outer: for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          if (
            matchesAtPrecision(token, pool[i]! - pool[j]!) ||
            matchesAtPrecision(token, pool[i]! + pool[j]!)
          ) {
            derivable = true;
            break outer;
          }
        }
      }
    }
    return { ...token, grounded, derivable };
  });
  return { numbers, hallucinated: numbers.filter((n) => !n.grounded) };
}
