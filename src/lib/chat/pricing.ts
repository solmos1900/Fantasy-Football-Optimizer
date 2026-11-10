/**
 * Per-question cost for AI chat, from real token counts × per-token prices.
 *
 * Prices come from the Vercel AI Gateway's model list (`pricing`, USD per
 * token), cached per instance for a day. CHAT_PRICE_INPUT_PER_MTOK_USD /
 * CHAT_PRICE_OUTPUT_PER_MTOK_USD override them when set. With neither, cost
 * is recorded as null (unknown) — never a guessed rate.
 */

import { gateway } from "ai";
import { memoTtl } from "@/lib/cache/memo";

export type ModelPricing = {
  /** USD per input token */
  input: number;
  /** USD per output token */
  output: number;
  /** USD per cached input token, when the model reports it */
  cachedInput?: number;
  source: "gateway" | "env";
};

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  /** Portion of inputTokens served from cache, when reported. */
  cachedInputTokens?: number;
};

function positive(n: unknown): number | null {
  const v = typeof n === "string" ? Number(n) : typeof n === "number" ? n : NaN;
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export function pricingFromEnv(env: Record<string, string | undefined> = process.env): ModelPricing | null {
  const input = positive(env.CHAT_PRICE_INPUT_PER_MTOK_USD);
  const output = positive(env.CHAT_PRICE_OUTPUT_PER_MTOK_USD);
  if (input == null || output == null) return null;
  return { input: input / 1e6, output: output / 1e6, source: "env" };
}

/** Prices for `modelId`; env override first, then the gateway model list. */
export async function getModelPricing(modelId: string): Promise<ModelPricing | null> {
  const fromEnv = pricingFromEnv();
  if (fromEnv) return fromEnv;
  try {
    return await memoTtl(`model-pricing:${modelId}`, 24 * 60 * 60_000, async () => {
      const { models } = await gateway.getAvailableModels();
      const model = models.find((m) => m.id === modelId);
      const input = positive(model?.pricing?.input);
      const output = positive(model?.pricing?.output);
      if (input == null || output == null) {
        throw new Error(`no gateway pricing for ${modelId}`);
      }
      const cached = positive(model?.pricing?.cachedInputTokens);
      return {
        input,
        output,
        ...(cached != null ? { cachedInput: cached } : {}),
        source: "gateway" as const,
      };
    });
  } catch (err) {
    console.error("[chat] model pricing unavailable", err);
    return null;
  }
}

/** USD cost of one turn; null when pricing or token counts are unknown. */
export function costFromUsage(
  usage: TokenUsage | undefined,
  pricing: ModelPricing | null,
): number | null {
  if (!pricing || !usage) return null;
  const input = usage.inputTokens;
  const output = usage.outputTokens;
  if (input == null || output == null) return null;
  const cached = Math.min(Math.max(usage.cachedInputTokens ?? 0, 0), input);
  const cachedRate = pricing.cachedInput ?? pricing.input;
  return (input - cached) * pricing.input + cached * cachedRate + output * pricing.output;
}
