/**
 * Current-season nflverse weekly roster (authoritative team-by-week).
 * https://github.com/nflverse/nflverse-data/releases/tag/weekly_rosters
 */

import { fetchText, parseCsv } from "@/lib/nflverse/csv";
import { defaultEspnSeason } from "@/lib/season";
import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";

export type NflverseWeeklyRosterRow = {
  espnId: number | null;
  sleeperId: string | null;
  gsisId: string | null;
  name: string;
  position: string;
  team: string | null;
  status: string;
  week: number;
  season: number;
};

const SKILL = new Set(["QB", "RB", "WR", "TE"]);

function weeklyRosterUrl(season: number): string {
  return `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`;
}

function cleanTeam(raw: string | null | undefined): string | null {
  const t = normalizeNflAbbrev((raw ?? "").trim().toUpperCase());
  if (!t || t === "FA" || t === "NONE") return null;
  return t;
}

/** On-club statuses (not free agent). CUT/EXE/RET = released / retired. */
export function isOnClubStatus(status: string): boolean {
  const s = status.trim().toUpperCase();
  if (!s) return false;
  // RES = Reserve/Injured — still on the club. CUT/EXE = released. RET = retired.
  if (s === "CUT" || s === "EXE" || s === "RET") return false;
  // ACT, IR, PUP, NFI, RES, DEV (practice squad), SUS, INA (inactive but on roster)
  return true;
}

export function isPickerClubStatus(status: string): boolean {
  const s = status.trim().toUpperCase();
  // Practice-squad DEV can still be fantasy-relevant; CUT cannot.
  return isOnClubStatus(s);
}

/**
 * Load latest-week skill rows from nflverse weekly roster for the season.
 * Returns maps keyed by espnId and sleeperId for identity-safe joins.
 */
export async function loadNflverseWeeklyRoster(options?: {
  season?: number;
}): Promise<{
  season: number;
  maxWeek: number;
  byEspnId: Map<number, NflverseWeeklyRosterRow>;
  bySleeperId: Map<string, NflverseWeeklyRosterRow>;
  fetchedAt: string;
}> {
  const season = options?.season ?? defaultEspnSeason();
  const text = await fetchText(weeklyRosterUrl(season));
  const rows = parseCsv(text);
  const byEspnId = new Map<number, NflverseWeeklyRosterRow>();
  const bySleeperId = new Map<string, NflverseWeeklyRosterRow>();
  let maxWeek = 0;

  for (const row of rows) {
    const pos = (row.position ?? "").trim().toUpperCase();
    if (!SKILL.has(pos)) continue;
    const week = Number(row.week);
    if (!Number.isFinite(week) || week < 1) continue;
    maxWeek = Math.max(maxWeek, week);

    const espnRaw = Number(row.espn_id);
    const espnId =
      Number.isFinite(espnRaw) && espnRaw > 0 ? espnRaw : null;
    const sleeperId = (row.sleeper_id ?? "").trim() || null;
    const gsisId = (row.gsis_id ?? "").trim() || null;
    const name =
      (row.full_name ?? row.football_name ?? "").trim() ||
      gsisId ||
      `player-${espnId ?? sleeperId}`;
    const team = cleanTeam(row.team);
    const status = (row.status ?? "").trim().toUpperCase() || "UNK";
    const entry: NflverseWeeklyRosterRow = {
      espnId,
      sleeperId,
      gsisId,
      name,
      position: pos,
      team,
      status,
      week,
      season,
    };

    // Keep the latest week per identity key
    if (espnId != null) {
      const prev = byEspnId.get(espnId);
      if (!prev || week >= prev.week) byEspnId.set(espnId, entry);
    }
    if (sleeperId) {
      const prev = bySleeperId.get(sleeperId);
      if (!prev || week >= prev.week) bySleeperId.set(sleeperId, entry);
    }
  }

  return {
    season,
    maxWeek,
    byEspnId,
    bySleeperId,
    fetchedAt: new Date().toISOString(),
  };
}
