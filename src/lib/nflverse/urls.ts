/**
 * Official nflverse-data GitHub release asset URLs (HTTPS).
 * Prefer CSV.GZ for smaller downloads on Vercel cron / CLI backfill.
 *
 * Attribution: nflverse open data (CC-BY) — see DATA_SOURCES.md
 */

const NFLVERSE_RELEASE =
  "https://github.com/nflverse/nflverse-data/releases/download";

/** DynastyProcess / ffverse player id crosswalk (what nflreadr load_ff_playerids uses). */
export const FF_PLAYERIDS_CSV_URL =
  "https://github.com/DynastyProcess/data/raw/master/files/db_playerids.csv";

export function statsPlayerWeekCsvGzUrl(season: number): string {
  return `${NFLVERSE_RELEASE}/stats_player/stats_player_week_${season}.csv.gz`;
}

export function statsPlayerWeekCsvUrl(season: number): string {
  return `${NFLVERSE_RELEASE}/stats_player/stats_player_week_${season}.csv`;
}

export function snapCountsCsvUrl(season: number): string {
  return `${NFLVERSE_RELEASE}/snap_counts/snap_counts_${season}.csv`;
}

export function playersCsvUrl(): string {
  return `${NFLVERSE_RELEASE}/players/players.csv`;
}
