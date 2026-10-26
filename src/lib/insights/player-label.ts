import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";

/**
 * App-wide Insights / trade display rule:
 * Always full player name + NFL team. Never last-only, suffix-only (III),
 * or position-rank labels (WR2 / RB1).
 */
export function formatPlayerLabel(
  name: string,
  nflTeam?: string | null,
): string {
  const n = (name ?? "").trim();
  // One spelling per club everywhere (nflverse stores the Rams as "LA",
  // ESPN as "LAR"; same for WAS/WSH, JAC/JAX…).
  const team = normalizeNflAbbrev(nflTeam) ?? "";
  if (!n) return team && team !== "FA" ? `(${team})` : "—";
  if (!team || team === "FA") return n;
  return `${n} (${team})`;
}
