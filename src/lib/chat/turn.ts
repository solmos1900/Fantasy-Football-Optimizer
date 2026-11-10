/**
 * One chat turn's model inputs — system prompt, model messages, tools and
 * generation settings. Shared by POST /api/chat and the chat eval
 * (scripts/eval-chat.ts) so the eval measures exactly what production runs.
 */

import {
  convertToModelMessages,
  isStepCount,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { CHAT_MAX_OUTPUT_TOKENS, CHAT_MAX_TOOL_STEPS, CHAT_MODEL_ID } from "@/lib/chat/config";
import type { ChatDataContext } from "@/lib/chat/player-resolve";
import { buildChatSystemPrompt } from "@/lib/chat/system-prompt";
import { buildChatTools, type ChatTools } from "@/lib/chat/tools";
import { parseMentionChips } from "@/lib/chat/mention-search";
import { formatPoolFreshnessLabel } from "@/lib/players/pool";
import { leagueScoring, scoringBoardLabel } from "@/lib/league/scoring";

/** Generation settings for every chat turn (model id lives in config.ts). */
export const CHAT_GENERATION_SETTINGS = {
  temperature: 0.2,
  maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
  stopWhen: isStepCount(CHAT_MAX_TOOL_STEPS),
} as const;

export type PreparedChatTurn = {
  model: typeof CHAT_MODEL_ID;
  system: string;
  messages: ModelMessage[];
  tools: ChatTools;
  freshnessLabel: string;
};

export function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const text = (m.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (text.trim()) return text.trim();
  }
  return "";
}

/**
 * Build the model inputs for a turn. `messages` must already be sanitized
 * (sanitizeChatHistory) — client payloads are never forwarded verbatim.
 */
export async function prepareChatTurn(input: {
  ctx: ChatDataContext;
  messages: UIMessage[];
  /** ESPN ids the client resolved from @ chips / templates. */
  mentionEspnIds?: number[];
}): Promise<PreparedChatTurn> {
  const { ctx } = input;
  const freshnessLabel = formatPoolFreshnessLabel(ctx.freshness);
  const mentionIds = [
    ...parseMentionChips(lastUserText(input.messages)).map((m) => m.espnId),
    ...(input.mentionEspnIds ?? []),
  ];

  const system = buildChatSystemPrompt({
    hasConnectedLeague: ctx.hasConnectedLeague,
    scoringBoard: ctx.hasConnectedLeague
      ? scoringBoardLabel(leagueScoring(ctx.league))
      : undefined,
    freshnessLabel,
    freshnessWarning: ctx.freshness.warning,
  });
  // Soft hint for the model with known mention ids
  const mentionHint =
    mentionIds.length > 0
      ? `\nKnown player ESPN ids from the user message chips: ${[...new Set(mentionIds)].join(", ")}.`
      : "";

  return {
    model: CHAT_MODEL_ID,
    system: system + mentionHint,
    messages: await convertToModelMessages(input.messages),
    tools: buildChatTools(ctx),
    freshnessLabel,
  };
}
