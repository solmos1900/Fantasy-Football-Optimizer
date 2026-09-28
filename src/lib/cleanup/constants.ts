/** Default: wipe abandoned guests after 24h (JWT may still linger; data does not). */
export const DEFAULT_GUEST_TTL_HOURS = 24;

/** Soft cap for LeagueConnection.cachedPayload JSON (chars). Oversized rows are nulled. */
export const CACHED_PAYLOAD_MAX_CHARS = 750_000;

export function guestTtlHoursFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.GUEST_SESSION_TTL_HOURS?.trim();
  if (!raw) return DEFAULT_GUEST_TTL_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_GUEST_TTL_HOURS;
  return Math.min(Math.floor(n), 24 * 30);
}
