/**
 * ID crosswalk: nflverse GSIS ↔ ESPN ↔ Sleeper.
 *
 * Primary: nflverse players.csv (gsis_id, espn_id, pfr_id).
 * Enrichment: DynastyProcess db_playerids (sleeper_id) — same source nflreadr
 * load_ff_playerids uses. Never fuzzy-match invent ESPN ids.
 */

import { fetchCsv, strOrNull, type CsvRow } from "./csv";
import { FF_PLAYERIDS_CSV_URL, playersCsvUrl } from "./urls";

export type CrosswalkEntry = {
  gsisId: string;
  espnId: number;
  sleeperId: string | null;
  pfrId: string | null;
  name: string | null;
  position: string | null;
  nflTeam: string | null;
};

export type PlayerCrosswalk = {
  byGsis: Map<string, CrosswalkEntry>;
  byEspn: Map<number, CrosswalkEntry>;
  byPfr: Map<string, CrosswalkEntry>;
  /** Players with GSIS but no ESPN id — logged, never invented. */
  unmappedGsisCount: number;
};

function parseEspnId(raw: string | null | undefined): number | null {
  const s = strOrNull(raw);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

function entryFromPlayersRow(row: CsvRow): CrosswalkEntry | null {
  const gsisId = strOrNull(row.gsis_id);
  if (!gsisId) return null;
  const espnId = parseEspnId(row.espn_id);
  if (espnId == null) return null;
  return {
    gsisId,
    espnId,
    sleeperId: null,
    pfrId: strOrNull(row.pfr_id),
    name: strOrNull(row.display_name),
    position: strOrNull(row.position),
    nflTeam: strOrNull(row.latest_team),
  };
}

function mergeSleeper(entry: CrosswalkEntry, sleeperId: string | null): CrosswalkEntry {
  if (!sleeperId || entry.sleeperId) return entry;
  return { ...entry, sleeperId };
}

/**
 * Build crosswalk maps. Skips rows without a real ESPN id (honesty).
 */
export function buildCrosswalk(
  playersRows: CsvRow[],
  ffPlayerIdRows: CsvRow[] = [],
): PlayerCrosswalk {
  const byGsis = new Map<string, CrosswalkEntry>();
  let unmappedGsisCount = 0;

  for (const row of playersRows) {
    const gsisId = strOrNull(row.gsis_id);
    if (!gsisId) continue;
    const entry = entryFromPlayersRow(row);
    if (!entry) {
      unmappedGsisCount += 1;
      continue;
    }
    byGsis.set(gsisId, entry);
  }

  // Enrich sleeper ids (+ fill any missing espn from ff_playerids when players.csv lacked it)
  for (const row of ffPlayerIdRows) {
    const gsisId = strOrNull(row.gsis_id);
    if (!gsisId) continue;
    const sleeperId = strOrNull(row.sleeper_id);
    const existing = byGsis.get(gsisId);
    if (existing) {
      byGsis.set(gsisId, mergeSleeper(existing, sleeperId));
      continue;
    }
    const espnId = parseEspnId(row.espn_id);
    if (espnId == null) {
      unmappedGsisCount += 1;
      continue;
    }
    byGsis.set(gsisId, {
      gsisId,
      espnId,
      sleeperId,
      pfrId: strOrNull(row.pfr_id),
      name: strOrNull(row.name) ?? strOrNull(row.merge_name),
      position: strOrNull(row.position),
      nflTeam: strOrNull(row.team),
    });
  }

  const byEspn = new Map<number, CrosswalkEntry>();
  const byPfr = new Map<string, CrosswalkEntry>();
  for (const entry of byGsis.values()) {
    byEspn.set(entry.espnId, entry);
    if (entry.pfrId) byPfr.set(entry.pfrId, entry);
  }

  return { byGsis, byEspn, byPfr, unmappedGsisCount };
}

export async function loadPlayerCrosswalk(): Promise<PlayerCrosswalk> {
  const [playersRows, ffRows] = await Promise.all([
    fetchCsv(playersCsvUrl()),
    fetchCsv(FF_PLAYERIDS_CSV_URL).catch((err) => {
      console.warn(
        "[nflverse] ff_playerids fetch failed; continuing with players.csv only",
        err instanceof Error ? err.message : err,
      );
      return [] as CsvRow[];
    }),
  ]);
  return buildCrosswalk(playersRows, ffRows);
}
