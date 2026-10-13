/**
 * Real read-only demo league configuration.
 *
 * DEMO_LEAGUE_CONNECTION_ID — Prisma `LeagueConnection.id` for the owner's
 * already-connected ESPN league. Guests/signed-in "Load demo league" read a
 * sanitized snapshot of that row (never cookies).
 *
 * DEMO_LEAGUE_SYNC_TTL_MINUTES — serve Neon cache first; only hit ESPN when
 * the source connection's lastSyncedAt is older than this TTL (default 12).
 */

export const SEED_DEMO_LEAGUE_ID = "demo-league";

export const DEFAULT_DEMO_SYNC_TTL_MINUTES = 12;

export function demoLeagueConnectionIdFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.DEMO_LEAGUE_CONNECTION_ID?.trim();
  return raw || null;
}

export function demoLeagueSyncTtlMsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.DEMO_LEAGUE_SYNC_TTL_MINUTES?.trim();
  const minutes = raw ? Number(raw) : DEFAULT_DEMO_SYNC_TTL_MINUTES;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_DEMO_SYNC_TTL_MINUTES * 60 * 1000;
  }
  // Cap at 24h so a typo cannot freeze refreshes forever.
  const capped = Math.min(minutes, 24 * 60);
  return capped * 60 * 1000;
}

/** True for the old in-memory fabricated seed — never serve this to guests. */
export function isFabricatedSeedLeague(league: {
  leagueId?: string;
  isDemo?: boolean;
}): boolean {
  return league.leagueId === SEED_DEMO_LEAGUE_ID;
}
