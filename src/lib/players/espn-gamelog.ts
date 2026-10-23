/**
 * ESPN athlete gamelog → full-PPR by week (secondary source when nflverse
 * has no box-score row). Used to fill null actualPpr gaps only.
 *
 * Only Regular Season seasonTypes are kept — ESPN reuses week numbers for
 * Postseason (and Preseason), so mixing them would write playoff PPR into
 * regular-season PlayerWeekStat slots (issue #103).
 */

import { fullPprFromCategories } from "@/lib/players/scoring";

export type EspnGamelogWeek = {
  week: number;
  opponent: string | null;
  /** Away when atVs is "@". */
  away: boolean | null;
  actualPpr: number;
};

export type EspnGamelogJson = {
  names?: string[];
  events?: Record<
    string,
    {
      week?: number;
      atVs?: string;
      opponent?: { abbreviation?: string };
    }
  >;
  seasonTypes?: Array<{
    /** e.g. "2025 Regular Season", "2025 Postseason" */
    displayName?: string;
    categories?: Array<{
      events?: Array<{ eventId?: string | number; stats?: string[] }>;
    }>;
  }>;
};

function numAt(
  names: string[],
  stats: string[],
  key: string,
): number | null {
  const i = names.indexOf(key);
  if (i < 0) return null;
  const raw = stats[i];
  if (raw == null || raw === "-" || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** ESPN labels REG as e.g. "2025 Regular Season" (not Postseason / Preseason). */
export function isEspnRegularSeasonType(displayName: string | undefined): boolean {
  return /regular\s*season/i.test(displayName?.trim() ?? "");
}

/**
 * Parse a site.web.api ESPN gamelog payload into full-PPR weeks.
 * Postseason / Preseason / unknown seasonTypes are dropped so week numbers
 * cannot collide with regular-season slots.
 */
export function parseEspnGamelogPpr(g: EspnGamelogJson): EspnGamelogWeek[] {
  const names = g.names ?? [];
  const events = g.events ?? {};
  const out: EspnGamelogWeek[] = [];

  for (const st of g.seasonTypes ?? []) {
    if (!isEspnRegularSeasonType(st.displayName)) continue;
    for (const cat of st.categories ?? []) {
      for (const ev of cat.events ?? []) {
        const meta = events[String(ev.eventId)];
        const week = Number(meta?.week);
        if (!Number.isFinite(week) || week < 1) continue;
        const stats = ev.stats ?? [];
        // Event present in gamelog = played; missing cats count as 0.
        // (Empty-category → fabricated 0 is tracked separately as issue #92.)
        const ppr =
          fullPprFromCategories({
            receptions: numAt(names, stats, "receptions") ?? 0,
            recYards: numAt(names, stats, "receivingYards") ?? 0,
            recTd: numAt(names, stats, "receivingTouchdowns") ?? 0,
            rushYards: numAt(names, stats, "rushingYards") ?? 0,
            rushTd: numAt(names, stats, "rushingTouchdowns") ?? 0,
            fumblesLost: numAt(names, stats, "fumblesLost") ?? 0,
            passYards: numAt(names, stats, "passingYards") ?? 0,
            passTd: numAt(names, stats, "passingTouchdowns") ?? 0,
            interceptions: numAt(names, stats, "interceptions") ?? 0,
          }) ?? 0;
        out.push({
          week,
          opponent: meta?.opponent?.abbreviation ?? null,
          away: meta?.atVs === "@" ? true : meta?.atVs === "vs" ? false : null,
          actualPpr: ppr,
        });
      }
    }
  }
  return out;
}

/**
 * Fetch ESPN site gamelog for one athlete and compute full-PPR per week.
 * Returns [] on network/parse failure (never throws).
 * Only Regular Season weeks are returned (see parseEspnGamelogPpr).
 */
export async function fetchEspnGamelogPpr(options: {
  espnId: number;
  season: number;
}): Promise<EspnGamelogWeek[]> {
  try {
    const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${options.espnId}/gamelog?season=${options.season}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const g = (await res.json()) as EspnGamelogJson;
    return parseEspnGamelogPpr(g);
  } catch {
    return [];
  }
}
