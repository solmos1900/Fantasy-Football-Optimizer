/**
 * Who-benefits copy for Trade Analyzer results.
 *
 * valueGap = receiveValue − giveValue (Side B − Side A in free mode;
 * you-get − you-give in team mode).
 *
 * Winner is always the higher chip-value side. Difference sign must agree:
 * gap > 0 → receive/Side B / You (team) ahead; gap < 0 → give/Side A / They ahead.
 */

export type TradeBenefitsMode = "team" | "free";

export type TradeBenefitsCopy = {
  headline: string;
  detail: string;
  /** "a" | "b" | "even" — which side has the higher chip total. */
  winner: "a" | "b" | "even";
};

const EVEN_EPS = 0.5;

/**
 * @param valueGap receiveValue − giveValue (must match the Difference number shown)
 * @param giveValue Side A / you-give chip total
 * @param receiveValue Side B / you-get chip total
 */
export function whoBenefitsCopy(
  valueGap: number,
  mode: TradeBenefitsMode,
  giveValue?: number,
  receiveValue?: number,
): TradeBenefitsCopy {
  // Prefer explicit side totals when provided (guards against sign drift).
  const a = giveValue ?? 0;
  const b = receiveValue ?? a + valueGap;
  const gap =
    giveValue != null && receiveValue != null
      ? receiveValue - giveValue
      : valueGap;

  if (Math.abs(gap) < EVEN_EPS || Math.abs(a - b) < EVEN_EPS) {
    return {
      headline: "Roughly even",
      detail:
        mode === "team"
          ? "You and your partner swap about the same value."
          : "Both sides swap about the same value.",
      winner: "even",
    };
  }

  // Higher chip total wins. gap = b − a, so gap > 0 ⇒ B higher, gap < 0 ⇒ A higher.
  if (gap > 0) {
    return {
      headline: mode === "team" ? "You win this deal" : "Side B wins this deal",
      detail: `Ahead by ${gap.toFixed(1)} points of value.`,
      winner: "b",
    };
  }

  return {
    headline: mode === "team" ? "They win this deal" : "Side A wins this deal",
    detail: `Ahead by ${Math.abs(gap).toFixed(1)} points of value.`,
    winner: "a",
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
