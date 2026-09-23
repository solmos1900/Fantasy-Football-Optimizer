import type { FantasyPlayer } from "@/lib/types";

/**
 * ESPN fantasy roster display order (starters then bench/IR).
 * Matches the conventional ESPN lineup board: QB → RB → WR → TE → FLEX → D/ST → K → BN → IR.
 */
export const ESPN_ROSTER_SLOT_ORDER = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "D/ST",
  "K",
  "BN",
  "IR",
] as const;

function slotKey(player: FantasyPlayer): string {
  return player.slot ?? player.position;
}

function slotRank(slot: string): number {
  const i = (ESPN_ROSTER_SLOT_ORDER as readonly string[]).indexOf(slot);
  return i === -1 ? 50 : i;
}

/** Stable ESPN-style roster sort for My Team and trade pickers. */
export function sortByEspnRosterOrder(
  players: FantasyPlayer[],
): FantasyPlayer[] {
  return players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => {
      const rankDiff = slotRank(slotKey(a.player)) - slotRank(slotKey(b.player));
      if (rankDiff !== 0) return rankDiff;
      return a.index - b.index;
    })
    .map(({ player }) => player);
}
