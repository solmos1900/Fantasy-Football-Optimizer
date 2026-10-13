/**
 * Sleeper public projections (current-week only for Insights).
 *
 * Official free API: GET /v1/projections/nfl/{season}/{week}
 * Crosswalk: Sleeper players nfl map `espn_id` → sleeper player_id.
 *
 * When the API returns empty shells (common on the free endpoint), we return
 * nulls — never invent or relabel ESPN projections as Sleeper.
 */

import { defaultEspnSeason } from "@/lib/season";

export type SleeperProjectionMap = {
  /** espnId → full-PPR projection for the requested week */
  byEspnId: Map<number, number>;
  season: number;
  week: number;
  fetchedAt: string;
  /** True when the endpoint responded but had zero numeric projections. */
  emptyFeed: boolean;
};

type SleeperPlayer = {
  player_id?: string;
  espn_id?: string | number | null;
  full_name?: string | null;
  position?: string | null;
  team?: string | null;
};

type SleeperProjRow = Record<string, number | string | null | undefined>;

const PLAYERS_TTL_MS = 6 * 60 * 60 * 1000;
let playersCache:
  | { at: number; espnToSleeper: Map<number, string> }
  | null = null;

async function loadEspnToSleeper(): Promise<Map<number, string>> {
  if (playersCache && Date.now() - playersCache.at < PLAYERS_TTL_MS) {
    return playersCache.espnToSleeper;
  }
  const res = await fetch("https://api.sleeper.app/v1/players/nfl", {
    next: { revalidate: 21600 },
  });
  if (!res.ok) {
    throw new Error(`Sleeper players HTTP ${res.status}`);
  }
  const raw = (await res.json()) as Record<string, SleeperPlayer>;
  const espnToSleeper = new Map<number, string>();
  for (const [sid, p] of Object.entries(raw)) {
    if (!p) continue;
    const espn = Number(p.espn_id);
    if (!Number.isFinite(espn) || espn <= 0) continue;
    if (!espnToSleeper.has(espn)) espnToSleeper.set(espn, sid);
  }
  playersCache = { at: Date.now(), espnToSleeper };
  return espnToSleeper;
}

function ptsPprFromRow(row: SleeperProjRow | null | undefined): number | null {
  if (!row || typeof row !== "object") return null;
  const pts = row.pts_ppr ?? row.pts_half_ppr ?? row.pts;
  if (typeof pts === "number" && Number.isFinite(pts)) {
    return Math.round(pts * 10) / 10;
  }
  if (typeof pts === "string" && pts.trim() !== "") {
    const n = Number(pts);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }
  return null;
}

/**
 * Fetch current-week Sleeper full-PPR projections keyed by ESPN id.
 * Empty feed → byEspnId empty + emptyFeed true (UI shows —).
 */
export async function fetchSleeperProjections(options?: {
  season?: number;
  week?: number;
}): Promise<SleeperProjectionMap> {
  const season = options?.season ?? defaultEspnSeason();
  const week = options?.week ?? 1;
  const fetchedAt = new Date().toISOString();
  const byEspnId = new Map<number, number>();

  try {
    const [espnToSleeper, projRes] = await Promise.all([
      loadEspnToSleeper(),
      fetch(
        `https://api.sleeper.app/v1/projections/nfl/${season}/${week}?season_type=regular`,
        { next: { revalidate: 600 } },
      ),
    ]);

    if (!projRes.ok) {
      return { byEspnId, season, week, fetchedAt, emptyFeed: true };
    }

    const raw = (await projRes.json()) as Record<string, SleeperProjRow>;
    let nonempty = 0;
    for (const [espnStr, sleeperId] of espnToSleeper) {
      const row = raw[sleeperId];
      const pts = ptsPprFromRow(row);
      if (pts == null) continue;
      byEspnId.set(espnStr, pts);
      nonempty += 1;
    }

    // Also accept rows keyed directly if API ever returns espn-shaped keys
    if (nonempty === 0) {
      for (const [key, row] of Object.entries(raw)) {
        const pts = ptsPprFromRow(row);
        if (pts == null) continue;
        const espn = Number(key);
        if (Number.isFinite(espn) && espn > 0) {
          byEspnId.set(espn, pts);
          nonempty += 1;
        }
      }
    }

    return {
      byEspnId,
      season,
      week,
      fetchedAt,
      emptyFeed: nonempty === 0,
    };
  } catch {
    return { byEspnId, season, week, fetchedAt, emptyFeed: true };
  }
}
