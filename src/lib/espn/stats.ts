/**
 * ESPN fantasy stat helpers.
 *
 * Missing appliedTotal must stay unknown (null). A published 0.0 is a real
 * goose egg and must be preserved — never coerce absent → 0.
 */

/** Finite ESPN appliedTotal, or null when the stat block / value is absent. */
export function finiteEspnAppliedTotal(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}
