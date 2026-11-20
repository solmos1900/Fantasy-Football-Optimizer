import type { FantasyPlayer, InjuryStatus } from "@/lib/types";

/**
 * Single source of truth for "can this player play this week?".
 *
 * Every advice screen (Who to Start, Start/Sit board, player detail, trade
 * value, trends, Insights engine, chat) must use these helpers instead of
 * keeping its own status list, so a PUP or suspended player is never treated
 * as available on one screen and unavailable on another.
 */

/** Statuses that mean the player cannot play this week. */
export const UNAVAILABLE_STATUSES: readonly InjuryStatus[] = [
  "OUT",
  "IR",
  "PUP",
  "SUSPENSION",
];

/**
 * Unavailable statuses plus DOUBTFUL: a player who most likely will not play.
 * Use this wherever the advice is "start" vs "don't start" or a health discount.
 */
export const NON_START_STATUSES: readonly InjuryStatus[] = [
  ...UNAVAILABLE_STATUSES,
  "DOUBTFUL",
];

function normalize(status: string | null | undefined): string {
  return (status ?? "").trim().toUpperCase();
}

/** OUT, IR, PUP or SUSPENSION. */
export function isUnavailableStatus(status: string | null | undefined): boolean {
  return (UNAVAILABLE_STATUSES as readonly string[]).includes(normalize(status));
}

/** OUT, IR, PUP, SUSPENSION or DOUBTFUL. */
export function isNonStartStatus(status: string | null | undefined): boolean {
  return (NON_START_STATUSES as readonly string[]).includes(normalize(status));
}

export function isDoubtfulStatus(status: string | null | undefined): boolean {
  return normalize(status) === "DOUBTFUL";
}

export function isUnavailable(player: Pick<FantasyPlayer, "injuryStatus">): boolean {
  return isUnavailableStatus(player.injuryStatus);
}

export function isNonStart(player: Pick<FantasyPlayer, "injuryStatus">): boolean {
  return isNonStartStatus(player.injuryStatus);
}
