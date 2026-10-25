/**
 * Server-side sanitising of client-sent chat history.
 *
 * The browser sends the whole thread on every turn. Trusting it verbatim let
 * a caller forge assistant/tool turns (prompt injection) and inflate token
 * spend with huge or numerous messages. We keep only user/assistant *text*,
 * cap each message's length, keep the last few turns, and require the thread
 * to end with a user message. Tool results are re-derived by the tools on
 * every turn — the model never needs the client's copy of them.
 */

import type { UIMessage } from "ai";
import {
  CHAT_MAX_HISTORY_MESSAGES,
  CHAT_MAX_MESSAGE_CHARS,
} from "@/lib/chat/config";

export type SanitizeResult =
  | { ok: true; messages: UIMessage[] }
  | { ok: false; error: string };

type LooseMessage = {
  id?: unknown;
  role?: unknown;
  parts?: unknown;
};

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        typeof p === "object" &&
        p !== null &&
        (p as { type?: unknown }).type === "text" &&
        typeof (p as { text?: unknown }).text === "string",
    )
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export function sanitizeChatHistory(
  raw: unknown[],
  options: { maxMessages?: number; maxChars?: number } = {},
): SanitizeResult {
  const maxMessages = options.maxMessages ?? CHAT_MAX_HISTORY_MESSAGES;
  const maxChars = options.maxChars ?? CHAT_MAX_MESSAGE_CHARS;

  const cleaned: UIMessage[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) return;
    const m = entry as LooseMessage;
    if (m.role !== "user" && m.role !== "assistant") return;
    const text = textOf(m.parts);
    if (!text) return;
    cleaned.push({
      id: typeof m.id === "string" && m.id ? m.id.slice(0, 64) : `m${index}`,
      role: m.role,
      parts: [{ type: "text", text: text.slice(0, maxChars) }],
    });
  });

  const last = cleaned[cleaned.length - 1];
  if (!last || last.role !== "user") {
    return { ok: false, error: "The last message must be your question." };
  }

  const lastText = textOf(
    (raw[raw.length - 1] as LooseMessage | undefined)?.parts,
  );
  if (lastText.length > maxChars) {
    return {
      ok: false,
      error: `Questions are limited to ${maxChars} characters.`,
    };
  }

  return { ok: true, messages: cleaned.slice(-maxMessages) };
}
