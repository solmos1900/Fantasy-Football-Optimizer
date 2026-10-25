/**
 * Single source of truth for the fantasy chat model.
 * Routed through Vercel AI Gateway (AI_GATEWAY_API_KEY or OIDC on Vercel).
 * Pick a fast, inexpensive tool-capable model — change only here.
 */
export const CHAT_MODEL_ID = "google/gemini-2.5-flash" as const;

/** Guest questions per UTC day (session / IP bucket). */
export const CHAT_GUEST_DAILY_LIMIT = 20;

/** Signed-in questions per UTC day. */
export const CHAT_USER_DAILY_LIMIT = 80;

/** Soft ceiling for tool-calling steps per turn. */
export const CHAT_MAX_TOOL_STEPS = 6;

export const CHAT_GATEWAY_UNAVAILABLE_NOTICE =
  "AI chat is temporarily unavailable. Check AI_GATEWAY_API_KEY (or Vercel OIDC) and try again. Trade Analyzer and Who to Start still work under Trades.";

/**
 * Guest questions per UTC day per client IP, across every guest session on
 * that IP. Guest sign-in mints a new user each time, so the per-guest cap
 * alone was bypassable by signing in again.
 */
export const CHAT_GUEST_IP_DAILY_LIMIT = 40;

/** Max output tokens per model step — replies are one verdict line. */
export const CHAT_MAX_OUTPUT_TOKENS = 600;

/** History sent to the model: last N user/assistant text turns. */
export const CHAT_MAX_HISTORY_MESSAGES = 12;

/** Longest accepted user message (chars). Older turns are truncated to this. */
export const CHAT_MAX_MESSAGE_CHARS = 2_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * Daily model-token budgets (input + output, UTC day). 0 disables that budget.
 * Defaults sit well above normal use of the question caps; they stop runaway
 * spend from oversized prompts, not ordinary users.
 */
export function chatTokenBudgets(): {
  user: number;
  guest: number;
  global: number;
} {
  return {
    user: envInt("CHAT_USER_DAILY_TOKEN_BUDGET", 1_500_000),
    guest: envInt("CHAT_GUEST_DAILY_TOKEN_BUDGET", 300_000),
    global: envInt("CHAT_GLOBAL_DAILY_TOKEN_BUDGET", 50_000_000),
  };
}

/** Kill-switch: CHAT_DISABLED=1 turns AI chat off without a deploy rollback. */
export function chatDisabled(): boolean {
  const raw = process.env.CHAT_DISABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export const CHAT_BUDGET_EXHAUSTED_NOTICE =
  "AI chat has reached today's usage limit. Trade Analyzer and Who to Start still work under Trades — chat resets at midnight UTC.";

export const CHAT_DISABLED_NOTICE =
  "AI chat is paused right now. Trade Analyzer and Who to Start still work under Trades.";
