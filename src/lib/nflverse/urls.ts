/**
 * Official nflverse-data GitHub release asset URLs (HTTPS only).
 * Prefer the current `stats_player` tag for weekly usage; fall back is unused.
 *
 * Attribution: https://github.com/nflverse/nflverse-data (CC BY 4.0)
 */

export const NFLVERSE_DATA_REPO =
  "https://github.com/nflverse/nflverse-data/releases/download";

/** Player id crosswalk (gsis_id ↔ espn_id). */
export function playersCsvUrl(): string {
  return `${NFLVERSE_DATA_REPO}/players/players.csv`;
}

/**
 * Weekly offensive player summary stats (targets, carries, shares, yards, …).
 * Season files through the active NFL year live under the `stats_player` tag.
 */
export function playerWeekStatsCsvGzUrl(season: number): string {
  return `${NFLVERSE_DATA_REPO}/stats_player/stats_player_week_${season}.csv.gz`;
}

/** Optional snap % by week (PFR-based; join by name + team + week). */
export function snapCountsCsvGzUrl(season: number): string {
  return `${NFLVERSE_DATA_REPO}/snap_counts/snap_counts_${season}.csv.gz`;
}
