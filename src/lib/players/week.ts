/**
 * NFL week helpers for no-league tools — ESPN public scoreboard only.
 */

import { fetchEspnScoreboard } from "@/lib/espn/client";
import { defaultEspnSeason } from "@/lib/season";

export type NflWeekSnapshot = {
  season: number;
  /** ESPN scoreboard week number (may be in progress). */
  currentWeek: number;
  /**
   * Latest fully finished regular-season week.
   * If the current week still has non-final games (or hasn't started), this is currentWeek - 1.
   * If every game in currentWeek is final, this equals currentWeek.
   */
  latestCompletedWeek: number;
  allCurrentWeekFinal: boolean;
  eventCount: number;
  fetchedAt: string;
};

type ScoreboardPayload = {
  week?: { number?: number };
  events?: Array<{
    status?: { type?: { state?: string } };
  }>;
};

export async function fetchNflWeekSnapshot(
  season = defaultEspnSeason(),
): Promise<NflWeekSnapshot> {
  const raw = (await fetchEspnScoreboard(undefined, season)) as ScoreboardPayload;
  const currentWeek = Number(raw.week?.number ?? 1);
  const events = raw.events ?? [];
  const states = events
    .map((e) => e.status?.type?.state ?? "pre")
    .filter(Boolean);
  const allCurrentWeekFinal =
    events.length > 0 && states.every((s) => s === "post");
  const anyStarted = states.some((s) => s === "in" || s === "post");

  let latestCompletedWeek: number;
  if (allCurrentWeekFinal) {
    latestCompletedWeek = currentWeek;
  } else if (anyStarted || currentWeek <= 1) {
    // In-progress week → prior week is the latest completed (week 1 → 0 means none yet).
    latestCompletedWeek = Math.max(0, currentWeek - 1);
  } else {
    // Pre-week slate: previous week finished.
    latestCompletedWeek = Math.max(0, currentWeek - 1);
  }

  return {
    season,
    currentWeek: Number.isFinite(currentWeek) && currentWeek > 0 ? currentWeek : 1,
    latestCompletedWeek,
    allCurrentWeekFinal,
    eventCount: events.length,
    fetchedAt: new Date().toISOString(),
  };
}
