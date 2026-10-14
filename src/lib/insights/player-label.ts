/**
 * App-wide Insights / trade / Who to Start display rule:
 * Always full player name + NFL team (including FA). Never last-only,
 * suffix-only (III), bare name, or position-rank labels (WR2 / RB1).
 */

export function formatPlayerLabel(
  name: string,
  nflTeam?: string | null,
): string {
  const n = (name ?? "").trim();
  const team = (nflTeam ?? "").trim().toUpperCase() || "FA";
  if (!n) return `(${team})`;
  return `${n} (${team})`;
}
