/**
 * Plain-language trade verdict + difference display.
 *
 * valueGap = receiveValue − giveValue (Side B − Side A in free mode;
 * you-get − you-give in team mode).
 *
 * Winner is always the higher chip-value side. Difference is always shown
 * from the winner's view as a positive (“+11.5 for Side A”) — never negative.
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

const EVEN_EPS = 0.5;

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

  if (Math.abs(gap) < EVEN_EPS || Math.abs(a - b) < EVEN_EPS) {
    return {
      headline:
        mode === "team"
          ? "Roughly even: you and your partner swap about the same value."
          : "Roughly even: both sides swap about the same value.",
      detail: "No clear winner on chip value.",
      winner: "even",
      absGap: 0,
      differenceLabel: "Even",
    };
  }

  // Higher chip total wins. gap = b − a, so gap > 0 ⇒ B higher, gap < 0 ⇒ A higher.
  const winner: "a" | "b" = gap > 0 ? "b" : "a";
  const loser: "a" | "b" = winner === "a" ? "b" : "a";

  if (mode === "team") {
    // give = you, receive = partner package you get
    if (winner === "b") {
      // You get more than you give
      return {
        headline: `Lopsided: You get ${absGap.toFixed(1)} more points of value; they shouldn't accept.`,
        detail: `+${absGap.toFixed(1)} for You`,
        winner,
        absGap,
        differenceLabel: `+${absGap.toFixed(1)} for You`,
      };
    }
    // You give more than you get
    return {
      headline: `Lopsided: You give ${absGap.toFixed(1)} more points of value than you get; you shouldn't accept.`,
      detail: `+${absGap.toFixed(1)} for Them`,
      winner,
      absGap,
      differenceLabel: `+${absGap.toFixed(1)} for Them`,
    };
  }

  // Free mode: Side A = give package, Side B = receive package
  const winLabel = winner === "a" ? "Side A" : "Side B";
  const loseLabel = loser === "a" ? "Side A" : "Side B";
  return {
    headline: `Lopsided: ${winLabel} gets ${absGap.toFixed(1)} more points of value; ${loseLabel} shouldn't accept.`,
    detail: `+${absGap.toFixed(1)} for ${winLabel}`,
    winner,
    absGap,
    differenceLabel: `+${absGap.toFixed(1)} for ${winLabel}`,
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
