/**
 * Canonical NFL / ESPN fantasy season year for new connections and empty forms.
 * Update this when the next fantasy season becomes current.
 *
 * Env overrides:
 * - DEFAULT_ESPN_SEASON (server)
 * - NEXT_PUBLIC_DEFAULT_SEASON (client forms; should match)
 */
export const CURRENT_FANTASY_SEASON = 2026;

export function defaultEspnSeason(): number {
  const fromEnv = Number(process.env.DEFAULT_ESPN_SEASON);
  if (Number.isFinite(fromEnv) && fromEnv >= 2018 && fromEnv <= 2100) {
    return fromEnv;
  }
  return CURRENT_FANTASY_SEASON;
}

/** Client-safe default (build-time public env or locked current season). */
export function defaultEspnSeasonClient(): number {
  const fromEnv = Number(process.env.NEXT_PUBLIC_DEFAULT_SEASON);
  if (Number.isFinite(fromEnv) && fromEnv >= 2018 && fromEnv <= 2100) {
    return fromEnv;
  }
  return CURRENT_FANTASY_SEASON;
}
