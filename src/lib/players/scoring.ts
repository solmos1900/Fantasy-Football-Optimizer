/**
 * Honest full-PPR from real ESPN / nflverse box-score category stats.
 * Never invents yards or TDs — only applies the published full-PPR formula.
 */

/** ESPN fantasy stat category ids used on kona_player_info / players payloads. */
export const ESPN_STAT = {
  passYards: "3",
  passTd: "4",
  interceptions: "20",
  rushYards: "24",
  rushTd: "25",
  receptions: "53",
  /** Some payloads use 41 for receptions instead of 53. */
  receptionsAlt: "41",
  recYards: "42",
  recTd: "43",
  fumblesLost: "72",
} as const;

/**
 * Standard full PPR:
 * passYds/25 + passTD×4 − INT×2 + rushYds/10 + rushTD×6 + rec + recYds/10 + recTD×6 − FL×2
 */
export function fullPprFromCategories(input: {
  passYards?: number | null;
  passTd?: number | null;
  interceptions?: number | null;
  rushYards?: number | null;
  rushTd?: number | null;
  receptions?: number | null;
  recYards?: number | null;
  recTd?: number | null;
  fumblesLost?: number | null;
}): number | null {
  const values = [
    input.passYards,
    input.passTd,
    input.interceptions,
    input.rushYards,
    input.rushTd,
    input.receptions,
    input.recYards,
    input.recTd,
    input.fumblesLost,
  ];
  if (values.every((v) => v == null)) return null;

  const n = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;

  const total =
    n(input.passYards) / 25 +
    n(input.passTd) * 4 -
    n(input.interceptions) * 2 +
    n(input.rushYards) / 10 +
    n(input.rushTd) * 6 +
    n(input.receptions) +
    n(input.recYards) / 10 +
    n(input.recTd) * 6 -
    n(input.fumblesLost) * 2;

  return Math.round(total * 10) / 10;
}

export function fullPprFromEspnStatMap(
  stats: Record<string, number> | null | undefined,
): number | null {
  if (!stats) return null;
  const receptions =
    stats[ESPN_STAT.receptions] ?? stats[ESPN_STAT.receptionsAlt] ?? null;
  return fullPprFromCategories({
    passYards: stats[ESPN_STAT.passYards] ?? null,
    passTd: stats[ESPN_STAT.passTd] ?? null,
    interceptions: stats[ESPN_STAT.interceptions] ?? null,
    rushYards: stats[ESPN_STAT.rushYards] ?? null,
    rushTd: stats[ESPN_STAT.rushTd] ?? null,
    receptions,
    recYards: stats[ESPN_STAT.recYards] ?? null,
    recTd: stats[ESPN_STAT.recTd] ?? null,
    fumblesLost: stats[ESPN_STAT.fumblesLost] ?? null,
  });
}

/** nflverse week row → full PPR from real box-score columns. */
export function fullPprFromNflverseRow(row: Record<string, string>): number | null {
  const num = (key: string) => {
    const raw = row[key];
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  return fullPprFromCategories({
    passYards: num("passing_yards"),
    passTd: num("passing_tds"),
    interceptions: num("passing_interceptions"),
    rushYards: num("rushing_yards"),
    rushTd: num("rushing_tds"),
    receptions: num("receptions"),
    recYards: num("receiving_yards"),
    recTd: num("receiving_tds"),
    fumblesLost:
      (num("rushing_fumbles_lost") ?? 0) +
        (num("receiving_fumbles_lost") ?? 0) +
        (num("sack_fumbles_lost") ?? 0) || null,
  });
}
