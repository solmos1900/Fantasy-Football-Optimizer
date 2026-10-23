/**
 * Plain-language trade verdict + difference display.
 *
 * valueGap = receiveValue − giveValue (Side B − Side A in free mode;
 * you-get − you-give in team mode).
 *
 * Winner is always the higher chip-value side. Difference is always shown
 * from the winner's view as a positive (“+11.5 for Side A”) — never negative.
 *
 * Verdict tiers (gap as a share of the larger side):
 * - Even: ≤ 5%
 * - Slight edge: more than 5% through 15%
 * - Lopsided: more than 15%
 *
 * One plain verdict replaces stamp labels like HARD REJECT + “Side A wins”
 * (those read as contradictory).
 */

export type TradeBenefitsMode = "team" | "free";

export type TradeBenefitsCopy = {
  /** Single plain verdict for the results card (no separate stamp needed). */
  headline: string;
  detail: string;
  /** "a" | "b" | "even" — which side has the higher chip total. */
  winner: "a" | "b" | "even";
  /** Absolute chip gap (always ≥ 0). */
  absGap: number;
  /** e.g. "+11.5 for Side A" — never a bare negative. */
  differenceLabel: string;
};

/** Gap ≤ this share of the larger side → Even. */
export const EVEN_GAP_RATIO = 0.05;
/** Gap ≤ this share (and above Even) → Slight edge; above → Lopsided. */
export const SLIGHT_EDGE_GAP_RATIO = 0.15;

export type VerdictTier = "even" | "slight_edge" | "lopsided";

/**
 * Classify the absolute gap against the larger side's value.
 * maxSide ≤ 0 → Even (no meaningful scale).
 */
export function verdictTierFromGap(
  absGap: number,
  maxSide: number,
): VerdictTier {
  if (!(maxSide > 0) || !(absGap > 0)) return "even";
  const ratio = absGap / maxSide;
  if (ratio > SLIGHT_EDGE_GAP_RATIO) return "lopsided";
  if (ratio > EVEN_GAP_RATIO) return "slight_edge";
  return "even";
}

/**
 * @param valueGap receiveValue − giveValue
 * @param giveValue Side A / you-give chip total
 * @param receiveValue Side B / you-get chip total
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
  const maxSide = Math.max(a, b);
  const tier = verdictTierFromGap(absGap, maxSide);

  if (tier === "even") {
    return {
      headline:
        mode === "team"
          ? "Even: you and your partner swap about the same value."
          : "Even: both sides swap about the same value.",
      detail: "No clear winner on chip value.",
      winner: "even",
      absGap: 0,
      differenceLabel: "Even",
    };
  }

  // Higher chip total wins. gap = b − a, so gap > 0 ⇒ B higher, gap < 0 ⇒ A higher.
  const winner: "a" | "b" = gap > 0 ? "b" : "a";
  const loser: "a" | "b" = winner === "a" ? "b" : "a";
  const gapText = absGap.toFixed(1);

  if (mode === "team") {
    // give = you, receive = partner package you get
    if (winner === "b") {
      if (tier === "slight_edge") {
        return {
          headline: `Slight edge: You get ${gapText} more points of value.`,
          detail: `+${gapText} for You`,
          winner,
          absGap,
          differenceLabel: `+${gapText} for You`,
        };
      }
      return {
        headline: `Lopsided: You get ${gapText} more points of value; they shouldn't accept.`,
        detail: `+${gapText} for You`,
        winner,
        absGap,
        differenceLabel: `+${gapText} for You`,
      };
    }
    if (tier === "slight_edge") {
      return {
        headline: `Slight edge: You give ${gapText} more points of value than you get.`,
        detail: `+${gapText} for Them`,
        winner,
        absGap,
        differenceLabel: `+${gapText} for Them`,
      };
    }
    return {
      headline: `Lopsided: You give ${gapText} more points of value than you get; you shouldn't accept.`,
      detail: `+${gapText} for Them`,
      winner,
      absGap,
      differenceLabel: `+${gapText} for Them`,
    };
  }

  // Free mode: Side A = give package, Side B = receive package
  const winLabel = winner === "a" ? "Side A" : "Side B";
  const loseLabel = loser === "a" ? "Side A" : "Side B";
  if (tier === "slight_edge") {
    return {
      headline: `Slight edge: ${winLabel} gets ${gapText} more points of value.`,
      detail: `+${gapText} for ${winLabel}`,
      winner,
      absGap,
      differenceLabel: `+${gapText} for ${winLabel}`,
    };
  }
  return {
    headline: `Lopsided: ${winLabel} gets ${gapText} more points of value; ${loseLabel} shouldn't accept.`,
    detail: `+${gapText} for ${winLabel}`,
    winner,
    absGap,
    differenceLabel: `+${gapText} for ${winLabel}`,
  };
}

/** True when both sides have real positive chip value (no 0.0-side verdict). */
export function bothSidesHaveValue(
  giveValue: number,
  receiveValue: number,
  eps = 0.05,
): boolean {
  return giveValue > eps && receiveValue > eps;
}
