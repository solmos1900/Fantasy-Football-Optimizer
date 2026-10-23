/**
 * Honest full-PPR from real ESPN / nflverse box-score category stats.
 * Never invents yards or TDs — only applies the published full-PPR formula.
 *
 * Actuals preference: nflverse `fantasy_points_ppr` is the source of truth.
 * The component formula is kept as a cross-check (logs when it diverges).
 */

/** ESPN fantasy stat category ids used on kona_player_info / players payloads. */
export const ESPN_STAT = {
  passYards: "3",
  passTd: "4",
  /** Passing 2-point conversions. */
  pass2pt: "19",
  interceptions: "20",
  rushYards: "24",
  rushTd: "25",
  /** Rushing 2-point conversions. */
  rush2pt: "26",
  receptions: "53",
  /** Some payloads use 41 for receptions instead of 53. */
  receptionsAlt: "41",
  recYards: "42",
  recTd: "43",
  /** Receiving 2-point conversions. */
  rec2pt: "44",
  /** Fumble recovered for TD (offensive). */
  fumbleRecoveryTd: "63",
  /** Component fumbles-lost ids (when total 72 is absent). */
  fumblesLostPass: "69",
  fumblesLostRush: "70",
  fumblesLostRec: "71",
  /** Total fumbles lost. */
  fumblesLost: "72",
} as const;

const PPR_CROSSCHECK_TOL = 0.06;

/**
 * Standard full PPR (nflverse / common default):
 * passYds/25 + passTD×4 − INT×2 + rushYds/10 + rushTD×6
 * + rec + recYds/10 + recTD×6
 * + (pass/rush/rec 2pt)×2 − FL×2
 * + specialTeamsTD×6 + fumbleRecoveryTD×6
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
  pass2pt?: number | null;
  rush2pt?: number | null;
  rec2pt?: number | null;
  specialTeamsTd?: number | null;
  fumbleRecoveryTd?: number | null;
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
    input.pass2pt,
    input.rush2pt,
    input.rec2pt,
    input.specialTeamsTd,
    input.fumbleRecoveryTd,
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
    n(input.recTd) * 6 +
    (n(input.pass2pt) + n(input.rush2pt) + n(input.rec2pt)) * 2 -
    n(input.fumblesLost) * 2 +
    n(input.specialTeamsTd) * 6 +
    n(input.fumbleRecoveryTd) * 6;

  // Two decimals match nflverse fantasy_points_ppr (e.g. Burrow W3 = 22.58).
  return Math.round(total * 100) / 100;
}

function espnStatSum(
  stats: Record<string, number>,
  ...ids: string[]
): number | null {
  let any = false;
  let sum = 0;
  for (const id of ids) {
    const v = stats[id];
    if (typeof v === "number" && Number.isFinite(v)) {
      any = true;
      sum += v;
    }
  }
  return any ? sum : null;
}

export function fullPprFromEspnStatMap(
  stats: Record<string, number> | null | undefined,
): number | null {
  if (!stats) return null;
  const receptions =
    stats[ESPN_STAT.receptions] ?? stats[ESPN_STAT.receptionsAlt] ?? null;
  const fumblesLost =
    stats[ESPN_STAT.fumblesLost] ??
    espnStatSum(
      stats,
      ESPN_STAT.fumblesLostPass,
      ESPN_STAT.fumblesLostRush,
      ESPN_STAT.fumblesLostRec,
    );
  return fullPprFromCategories({
    passYards: stats[ESPN_STAT.passYards] ?? null,
    passTd: stats[ESPN_STAT.passTd] ?? null,
    interceptions: stats[ESPN_STAT.interceptions] ?? null,
    rushYards: stats[ESPN_STAT.rushYards] ?? null,
    rushTd: stats[ESPN_STAT.rushTd] ?? null,
    receptions,
    recYards: stats[ESPN_STAT.recYards] ?? null,
    recTd: stats[ESPN_STAT.recTd] ?? null,
    fumblesLost,
    pass2pt: stats[ESPN_STAT.pass2pt] ?? null,
    rush2pt: stats[ESPN_STAT.rush2pt] ?? null,
    rec2pt: stats[ESPN_STAT.rec2pt] ?? null,
    fumbleRecoveryTd: stats[ESPN_STAT.fumbleRecoveryTd] ?? null,
  });
}

/**
 * nflverse week row → full PPR.
 * Prefers published `fantasy_points_ppr`; recomputes from box-score columns
 * as a cross-check and logs when they disagree.
 */
export function fullPprFromNflverseRow(row: Record<string, string>): number | null {
  const num = (key: string) => {
    const raw = row[key];
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const fromCats = fullPprFromCategories({
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
    pass2pt: num("passing_2pt_conversions"),
    rush2pt: num("rushing_2pt_conversions"),
    rec2pt: num("receiving_2pt_conversions"),
    specialTeamsTd: num("special_teams_tds"),
    fumbleRecoveryTd: num("fumble_recovery_tds"),
  });

  const published = num("fantasy_points_ppr");
  if (published != null) {
    const rounded = Math.round(published * 100) / 100;
    if (
      fromCats != null &&
      Math.abs(fromCats - rounded) > PPR_CROSSCHECK_TOL
    ) {
      const who =
        row.player_display_name ||
        row.player_name ||
        row.player_id ||
        "unknown";
      const week = row.week ?? "?";
      console.warn(
        `[scoring] nflverse PPR cross-check: ${who} W${week} published=${rounded} components=${fromCats}`,
      );
    }
    return rounded;
  }

  return fromCats;
}
