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
