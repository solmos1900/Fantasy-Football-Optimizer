/**
 * Who may appear in Trade Analyzer search / produce a graded verdict.
 * Players with no NFL team or no completed-week 2026 stats are excluded —
 * do not paper over bad pool rows with FA labels or 0.0 verdicts.
 */

import type { FantasyPlayer } from "@/lib/types";
import { defaultEspnSeason } from "@/lib/season";

export function hasNflTeam(player: FantasyPlayer): boolean {
  const team = (player.nflTeam ?? "").trim().toUpperCase();
  return Boolean(team) && team !== "FA";
}

/** At least one completed-week full-PPR (or league) score on the player. */
export function hasCompletedWeekStats(
  player: FantasyPlayer,
  season = defaultEspnSeason(),
): boolean {
  void season; // season is documented for call-site clarity; weeks are already scoped
  return (player.recentWeeks ?? []).some(
    (w) => typeof w.points === "number" && Number.isFinite(w.points),
  );
}

export function isTradeSelectablePlayer(player: FantasyPlayer): boolean {
  return hasNflTeam(player) && hasCompletedWeekStats(player);
}

export function tradeIneligibleReason(player: FantasyPlayer): string | null {
  if (!hasNflTeam(player)) {
    return "No NFL team on file — not selectable for trades.";
  }
  if (!hasCompletedWeekStats(player)) {
    return "No 2026 stats — not selectable for trades.";
  }
  return null;
}
