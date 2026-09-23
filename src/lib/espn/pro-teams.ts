/**
 * ESPN Fantasy Football `proTeamId` → standard NFL abbreviations.
 * Covers 2024–2026 FFL seasons (FA = 0). IDs 31–32 are unused historically.
 *
 * Prefer any abbreviation ESPN returns on the player object; fall back to this map.
 * Normalized to scoreboard-style uppercase (WSH, JAX, LAR, LAC, LV).
 */

export const ESPN_PRO_TEAM_ABBREV: Readonly<Record<number, string>> = {
  0: "FA",
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WSH",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};

/** Common alternate spellings → scoreboard abbreviations. */
const ABBREV_ALIASES: Readonly<Record<string, string>> = {
  WAS: "WSH",
  WFT: "WSH",
  JAC: "JAX",
  ARZ: "ARI",
  STL: "LAR",
  LA: "LAR",
  SD: "LAC",
  OAK: "LV",
};

/**
 * Normalize an NFL team abbreviation to the form used by ESPN's public scoreboard.
 */
export function normalizeNflAbbrev(abbrev: string | null | undefined): string | null {
  if (!abbrev?.trim()) return null;
  const upper = abbrev.trim().toUpperCase();
  if (upper === "FA" || upper === "FREE AGENT") return "FA";
  return ABBREV_ALIASES[upper] ?? upper;
}

/**
 * Resolve a player's NFL team abbrev from ESPN fields.
 * Prefers an explicit abbreviation when present; otherwise uses the proTeamId table.
 */
export function nflTeamFromEspn(
  proTeamId: number,
  preferredAbbrev?: string | null,
): string {
  const fromPreferred = normalizeNflAbbrev(preferredAbbrev);
  if (fromPreferred && fromPreferred !== "FA") {
    return fromPreferred;
  }
  if (fromPreferred === "FA" || !proTeamId) {
    return "FA";
  }
  return ESPN_PRO_TEAM_ABBREV[proTeamId] ?? `T${proTeamId}`;
}
