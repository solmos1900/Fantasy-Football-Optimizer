/**
 * Plain-language trade verdict + difference display.
 *
 * valueGap = receiveValue − giveValue (Right − Left in free mode;
 * you-get − you-give in team mode).
 *
 * Verdict tiers use the **percentage** gap vs the **lower** side's value
 * (`abs(a−b) / min(a,b)`) — never a raw point threshold alone:
 *   < 5%  → even
 *   5–15% → slight edge
 *   > 15% → lopsided
 *
 * For chat free trades, a/b are season-points-per-game package totals.
 * Winner is always the higher-value side. Difference is always shown
 * from the winner's view as a positive (“+11.5 for Left”) — never negative.
 */

export type TradeBenefitsMode = "team" | "free";

/** Even / slight edge / lopsided — driven by percentage gap. */
export type TradeVerdictTier = "even" | "slight_edge" | "lopsided";

/**
 * UI tone for the headline:
 * - neutral: even deal
 * - positive: slight edge / lopsided favoring the reader (team: you get more)
 * - caution: slight edge / lopsided where someone shouldn't accept
 */
export type TradeVerdictTone = "neutral" | "positive" | "caution";

export type TradeBenefitsCopy = {
  /** Single plain verdict for the results card (no separate stamp needed). */
  headline: string;
  detail: string;
  /** "a" | "b" | "even" — which side has the higher value (a = Left / you-give). */
  winner: "a" | "b" | "even";
  /** Absolute value gap (always ≥ 0). */
  absGap: number;
  /** Percentage gap vs the **lower** side (0–1). Even when winner is even. */
  pctGap: number;
  /** even | slight_edge | lopsided */
  tier: TradeVerdictTier;
  /** Color cue for UI — never green on "shouldn't accept". */
  tone: TradeVerdictTone;
  /** e.g. "+11.5 for Left" — never a bare negative. */
  differenceLabel: string;
};

/** Even when the relative gap is below this (5%). */
export const TRADE_EVEN_PCT = 0.05;
/** Lopsided only when the relative gap is above this (15%). */
export const TRADE_LOPSIDED_PCT = 0.15;

/**
 * Relative gap as a fraction of the **lower** side:
 * abs(a − b) / min(a, b).
 * That matches plain “X% more value” vs the weaker package.
 * When one side is ~0 and the other is positive → 100% (fully lopsided).
 */
export function tradeRelativeGapPct(giveValue: number, receiveValue: number): number {
  const a = giveValue;
  const b = receiveValue;
  const absGap = Math.abs(a - b);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo > 0 && Number.isFinite(lo)) return absGap / lo;
  if (hi > 0 && Number.isFinite(hi)) return 1;
  return 0;
}

export function tradeVerdictTierFromPct(pctGap: number): TradeVerdictTier {
  if (pctGap < TRADE_EVEN_PCT) return "even";
  if (pctGap <= TRADE_LOPSIDED_PCT) return "slight_edge";
  return "lopsided";
}

/** @deprecated Prefer TRADE_EVEN_PCT — alias kept for #130 call sites. */
export const EVEN_GAP_RATIO = TRADE_EVEN_PCT;
/** @deprecated Prefer TRADE_LOPSIDED_PCT — alias kept for #130 call sites. */
export const SLIGHT_EDGE_GAP_RATIO = TRADE_LOPSIDED_PCT;
/** @deprecated Prefer TradeVerdictTier. */
export type VerdictTier = TradeVerdictTier;

/**
 * Classify absGap / sideScale with the shared even / slight / lopsided bands.
 * Callers should pass the **lower** side as `sideScale` (same as
 * {@link tradeRelativeGapPct}). sideScale ≤ 0 → even.
 */
export function verdictTierFromGap(
  absGap: number,
  sideScale: number,
): TradeVerdictTier {
  if (!(sideScale > 0) || !(absGap > 0)) return "even";
  return tradeVerdictTierFromPct(absGap / sideScale);
}

/**
 * @param valueGap receiveValue − giveValue
 * @param giveValue Left / you-give total
 * @param receiveValue Right / you-get total
 */
export function whoBenefitsCopy(
  valueGap: number,
  mode: TradeBenefitsMode,
  giveValue?: number,
  receiveValue?: number,
): TradeBenefitsCopy {
  const a = giveValue ?? 0;
  const b = receiveValue ?? a + valueGap;
  const gap =
    giveValue != null && receiveValue != null
      ? receiveValue - giveValue
      : valueGap;
  const absGap = Math.abs(gap);
  const pctGap = tradeRelativeGapPct(a, b);
  const tier = tradeVerdictTierFromPct(pctGap);

  if (tier === "even") {
    return {
      headline:
        mode === "team"
          ? "Roughly even: you and your partner swap about the same value."
          : "Roughly even: both sides swap about the same value.",
      detail: "No clear winner on trade value.",
      winner: "even",
      absGap: 0,
      pctGap,
      tier,
      tone: "neutral",
      differenceLabel: "Even",
    };
  }

  // Higher value wins. gap = b − a, so gap > 0 ⇒ Right/you-get higher.
  const winner: "a" | "b" = gap > 0 ? "b" : "a";
  const pctLabel = `${(pctGap * 100).toFixed(0)}%`;
  const gapPts = absGap.toFixed(1);
  const tierWord = tier === "lopsided" ? "Lopsided" : "Slight edge";

  if (mode === "team") {
    if (winner === "b") {
      // You get more than you give
      return {
        headline: `${tierWord}: You get ${gapPts} more points of value (${pctLabel}); they shouldn't accept.`,
        detail: `+${gapPts} for You`,
        winner,
        absGap,
        pctGap,
        tier,
        // Favorable to you, but still "they shouldn't accept" → caution (not green celebration of a bad deal for them)
        tone: "caution",
        differenceLabel: `+${gapPts} for You`,
      };
    }
    // You give more than you get
    return {
      headline: `${tierWord}: You give ${gapPts} more points of value than you get (${pctLabel}); you shouldn't accept.`,
      detail: `+${gapPts} for Them`,
      winner,
      absGap,
      pctGap,
      tier,
      tone: "caution",
      differenceLabel: `+${gapPts} for Them`,
    };
  }

  // Free mode: Left = give, Right = receive
  const winLabel = winner === "a" ? "Left" : "Right";
  const loseLabel = winner === "a" ? "Right" : "Left";
  return {
    headline: `${tierWord}: ${winLabel} gets ${gapPts} more points of value (${pctLabel}); ${loseLabel} shouldn't accept.`,
    detail: `+${gapPts} for ${winLabel}`,
    winner,
    absGap,
    pctGap,
    tier,
    tone: "caution",
    differenceLabel: `+${gapPts} for ${winLabel}`,
  };
}

/** True when both sides have real positive value (no 0.0-side verdict). */
export function bothSidesHaveValue(
  giveValue: number,
  receiveValue: number,
  eps = 0.05,
): boolean {
  return giveValue > eps && receiveValue > eps;
}
