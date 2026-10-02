/**
 * ESPN ↔ GSIS crosswalk from nflverse players.csv.
 */

import { fetchText, parseCsv, parseOptionalInt } from "./csv";
import { playersCsvUrl } from "./urls";

export type PlayerIdCrosswalk = {
  /** gsis_id → espnId */
  gsisToEspn: Map<string, number>;
  /** espnId → gsis_id */
  espnToGsis: Map<number, string>;
  /** gsis_id → display name / position / team hints */
  meta: Map<
    string,
    { name: string; position: string; nflTeam: string | null }
  >;
};

export async function loadPlayerIdCrosswalk(): Promise<PlayerIdCrosswalk> {
  const text = await fetchText(playersCsvUrl());
  const rows = parseCsv(text);
  const gsisToEspn = new Map<string, number>();
  const espnToGsis = new Map<number, string>();
  const meta = new Map<
    string,
    { name: string; position: string; nflTeam: string | null }
  >();

  for (const row of rows) {
    const gsisId = (row.gsis_id ?? "").trim();
    if (!gsisId) continue;
    const espnId = parseOptionalInt(row.espn_id);
    const name = (row.display_name ?? row.football_name ?? "").trim() || gsisId;
    const position = (row.position ?? "").trim().toUpperCase() || "UNK";
    const nflTeam = (row.latest_team ?? "").trim() || null;
    meta.set(gsisId, { name, position, nflTeam });
    if (espnId == null || espnId <= 0) continue;
    gsisToEspn.set(gsisId, espnId);
    // Prefer first mapping; later duplicates are rare
    if (!espnToGsis.has(espnId)) espnToGsis.set(espnId, gsisId);
  }

  return { gsisToEspn, espnToGsis, meta };
}
