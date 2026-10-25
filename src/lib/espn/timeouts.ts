/**
 * Upper bound for any single ESPN HTTP call. ESPN endpoints are unofficial
 * and occasionally hang; without a bound a stuck call held the whole
 * serverless function until the platform killed it.
 */
export const ESPN_TIMEOUT_MS = 12_000;

/** Scoreboard is small and on the hot path — fail faster. */
export const ESPN_SCOREBOARD_TIMEOUT_MS = 8_000;
