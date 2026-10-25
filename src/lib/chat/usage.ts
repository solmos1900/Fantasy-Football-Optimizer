/**
 * Per-turn token metering for AI chat (cost tracking + daily budgets).
 */

import { prisma } from "@/lib/db";
import { recordTokenSpend } from "@/lib/chat/rate-limit";

export type ChatTurnUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export function usageTotals(usage: ChatTurnUsage | undefined): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const inputTokens = Math.max(0, Math.round(usage?.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(usage?.outputTokens ?? 0));
  const totalTokens = Math.max(
    0,
    Math.round(usage?.totalTokens ?? inputTokens + outputTokens),
  );
  return { inputTokens, outputTokens, totalTokens };
}

/** Persist one turn's usage and add it to the daily token budgets. */
export async function recordChatUsage(options: {
  userId: string;
  isGuest: boolean;
  conversationId: string | null;
  bucketKey: string;
  model: string;
  steps: number;
  usage: ChatTurnUsage | undefined;
}): Promise<void> {
  const totals = usageTotals(options.usage);
  await Promise.all([
    prisma.chatUsage.create({
      data: {
        userId: options.userId,
        isGuest: options.isGuest,
        conversationId: options.conversationId,
        model: options.model,
        steps: options.steps,
        ...totals,
      },
    }),
    recordTokenSpend({
      bucketKey: options.bucketKey,
      tokens: totals.totalTokens,
    }),
  ]);
}
