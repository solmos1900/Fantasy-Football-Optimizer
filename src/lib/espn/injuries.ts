/**
 * ESPN public NFL injuries feed — real status only.
 * https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries
 *
 * Team comes from the injuries group parent (not nested athlete.team, which
 * can be missing/stale). Status mapped to Gridiron InjuryStatus.
 *
 * Matching (#137): ESPN athlete id when present; else normalized name+team
 * (strip Jr./Sr./II/III, apostrophes). Sleeper overlay uses espnId first,
 * then the same normalized name+team key (byNameTeam is built but was unused).
 */

import type { InjuryStatus, PlayerPosition } from "@/lib/types";
import { normalizePlayerNameKey } from "@/lib/nflverse/weekly-roster";

export type EspnInjuryRow = {
  name: string;
  espnAthleteId: number | null;
  nflTeam: string;
  position: PlayerPosition | null;
  status: InjuryStatus;
  detail: string | null;
};

/** Higher = more serious. Used to merge ESPN report + Sleeper injury_status. */
export function injurySeverityRank(status: InjuryStatus): number {
  switch (status) {
    case "IR":
    case "PUP":
    case "OUT":
    case "SUSPENSION":
      return 4;
    case "DOUBTFUL":
      return 3;
    case "QUESTIONABLE":
      return 2;
    case "UNKNOWN":
      return 1;
    case "ACTIVE":
    default:
      return 0;
  }
}

/** Prefer the more serious of two injury statuses (owner rule for guest pool). */
export function moreSeriousInjuryStatus(
  a: InjuryStatus,
  b: InjuryStatus,
): InjuryStatus {
  return injurySeverityRank(b) > injurySeverityRank(a) ? b : a;
}

/** Name+team key for injury matching (Jr./apostrophes normalized). */
export function injuryNameTeamKey(name: string, team: string): string {
  const n = normalizePlayerNameKey(name);
  const t = (team ?? "").trim().toUpperCase();
  return t ? `${n}|${t}` : n;
}

export function mapStatus(raw: string | undefined | null): InjuryStatus | null {
  if (!raw) return null;
  const u = raw.toUpperCase().trim();
  if (!u) return null;
  if (u.includes("INJURY RESERVE") || u === "IR" || u.includes("INJURED RESERVE"))
    return "IR";
  // PUP before OUT — "OUT" must not steal Physically Unable to Perform.
  if (
    u === "PUP" ||
    u.includes("PHYSICALLY UNABLE") ||
    /PUP\b/.test(u) ||
    u.includes("RESERVE/PUP") ||
    u.includes("RESERVE / PUP")
  ) {
    return "PUP";
  }
  if (u.includes("SUSPENSION") || u === "SUS" || u === "SUSP") return "SUSPENSION";
  // NFI / Non-Football Injury → treat as Out for start/sit.
  if (
    u === "NFI" ||
    u.includes("NON-FOOTBALL") ||
    u.includes("NON FOOTBALL")
  ) {
    return "OUT";
  }
  if (u.includes("OUT")) return "OUT";
  if (u.includes("DOUBTFUL")) return "DOUBTFUL";
  if (u.includes("QUESTIONABLE")) return "QUESTIONABLE";
  if (u === "ACTIVE" || u.includes("PROBABLE")) return "ACTIVE";
  return null;
}

/**
 * Map Sleeper `injury_status` strings onto InjuryStatus.
 * Returns null for empty / non-injury labels (e.g. DNR — handled by roster authority).
 */
export function mapSleeperInjuryStatus(
  raw: string | null | undefined,
): InjuryStatus | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase();
  if (!u) return null;
  if (
    u === "DNR" ||
    /DID\s*NOT\s*REPORT|LEFT\s*SQUAD|RESERVE\/?\s*LEFT/i.test(u)
  ) {
    return null;
  }
  return mapStatus(u);
}

function mapPos(raw: string | undefined | null): PlayerPosition | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === "QB" || u === "RB" || u === "WR" || u === "TE") return u;
  if (u === "FB") return "RB";
  return null;
}

/**
 * Fetch current NFL injury report. Failures return [] (callers keep roster status).
 */
export async function fetchEspnInjuryReport(): Promise<EspnInjuryRow[]> {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries",
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      injuries?: Array<{
        id?: string;
        displayName?: string;
        team?: { abbreviation?: string };
        injuries?: Array<{
          status?: string | { type?: string; description?: string; abbreviation?: string };
          longComment?: string;
          shortComment?: string;
          athlete?: {
            id?: string | number;
            displayName?: string;
            position?: { abbreviation?: string } | string;
            team?: { abbreviation?: string };
          };
        }>;
      }>;
    };

    const out: EspnInjuryRow[] = [];
    for (const group of data.injuries ?? []) {
      for (const row of group.injuries ?? []) {
        const athlete = row.athlete;
        if (!athlete?.displayName) continue;
        const teamAbbrev = (
          athlete.team?.abbreviation ??
          group.team?.abbreviation ??
          ""
        ).toUpperCase();
        if (!teamAbbrev) continue;
        // Prefer explicit injury type / status string over fantasyStatus
        // (fantasyStatus can lag — e.g. type OUT while fantasy still Q).
        const details = (
          row as {
            details?: { fantasyStatus?: { description?: string } };
            type?: { abbreviation?: string; description?: string; name?: string };
          }
        ).details;
        const typ = (
          row as {
            type?: { abbreviation?: string; description?: string; name?: string };
          }
        ).type;
        const candidates = [
          typ?.name,
          typ?.description,
          typ?.abbreviation,
          typeof row.status === "string"
            ? row.status
            : row.status?.type ??
              row.status?.description ??
              row.status?.abbreviation,
          details?.fantasyStatus?.description,
        ];
        let status: InjuryStatus | null = null;
        for (const c of candidates) {
          const mapped = mapStatus(c ?? null);
          if (!mapped) continue;
          if (!status || injurySeverityRank(mapped) > injurySeverityRank(status)) {
            status = mapped;
          }
        }
        if (!status || status === "ACTIVE") continue;
        const posRaw =
          typeof athlete.position === "string"
            ? athlete.position
            : athlete.position?.abbreviation;
        out.push({
          name: athlete.displayName,
          espnAthleteId: athlete.id != null ? Number(athlete.id) : null,
          nflTeam: teamAbbrev,
          position: mapPos(posRaw ?? null),
          status,
          detail: row.longComment ?? row.shortComment ?? null,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Apply injury report onto FantasyPlayer-like rows matched by espnId or name+team. */
export function applyInjuryReport<
  T extends {
    espnId: number;
    name: string;
    nflTeam: string;
    position: PlayerPosition;
    injuryStatus: InjuryStatus;
  },
>(players: T[], report: EspnInjuryRow[]): T[] {
  if (!report.length) return players;
  const byEspn = new Map<number, EspnInjuryRow>();
  const byNameTeam = new Map<string, EspnInjuryRow>();
  const byName = new Map<string, EspnInjuryRow[]>();
  for (const r of report) {
    if (r.espnAthleteId) byEspn.set(r.espnAthleteId, r);
    byNameTeam.set(injuryNameTeamKey(r.name, r.nflTeam), r);
    const nk = normalizePlayerNameKey(r.name);
    const list = byName.get(nk) ?? [];
    list.push(r);
    byName.set(nk, list);
  }

  return players.map((p) => {
    const hit =
      byEspn.get(p.espnId) ??
      byNameTeam.get(injuryNameTeamKey(p.name, p.nflTeam)) ??
      // Name-only fallback when ESPN athlete id missing — require team match
      // against our roster/nflverse team to avoid cross-team collisions.
      (byName.get(normalizePlayerNameKey(p.name)) ?? []).find(
        (r) => r.nflTeam === p.nflTeam,
      );
    if (!hit) return p;
    // Prefer harsher report status over ACTIVE placeholder; don't overwrite
    // a harder roster status with a softer report.
    if (injurySeverityRank(hit.status) >= injurySeverityRank(p.injuryStatus)) {
      return { ...p, injuryStatus: hit.status };
    }
    return p;
  });
}

export type SleeperInjuryLookup = {
  injuryStatus: string | null;
  name?: string;
  team?: string | null;
};

/**
 * Overlay Sleeper injury_status onto pool players, keeping the more serious
 * of the current status and Sleeper's (owner rule vs ESPN report).
 *
 * Match order (#137): ESPN id → normalized name+team (many skill players have
 * null espn_id on Sleeper — Jawhar Jordan, Dalton Kincaid, etc.).
 */
export function applySleeperInjuryStatuses<
  T extends {
    espnId: number;
    name: string;
    nflTeam: string;
    injuryStatus: InjuryStatus;
  },
>(
  players: T[],
  directory: {
    byEspnId: Map<number, SleeperInjuryLookup>;
    byNameTeam?: Map<string, SleeperInjuryLookup>;
    allSkill?: Array<SleeperInjuryLookup & { name: string; team: string | null }>;
  },
): T[] {
  const byEspnId = directory.byEspnId;
  // Build normalized name|team index (Sleeper's own nameTeamKey is exact-case
  // lowercased and does not strip Jr./apostrophes — rebuild here).
  const byNormNameTeam = new Map<string, SleeperInjuryLookup>();
  if (directory.allSkill?.length) {
    for (const p of directory.allSkill) {
      if (!p.team) continue;
      const key = injuryNameTeamKey(p.name, p.team);
      if (!byNormNameTeam.has(key)) byNormNameTeam.set(key, p);
    }
  } else if (directory.byNameTeam?.size) {
    for (const [rawKey, p] of directory.byNameTeam) {
      const pipe = rawKey.indexOf("|");
      const name = pipe >= 0 ? rawKey.slice(0, pipe) : rawKey;
      const team = pipe >= 0 ? rawKey.slice(pipe + 1) : (p.team ?? "");
      if (!team) continue;
      const key = injuryNameTeamKey(name, team);
      if (!byNormNameTeam.has(key)) byNormNameTeam.set(key, p);
    }
  }

  if (!byEspnId.size && !byNormNameTeam.size) return players;

  return players.map((p) => {
    const sleeper =
      byEspnId.get(p.espnId) ??
      byNormNameTeam.get(injuryNameTeamKey(p.name, p.nflTeam));
    const mapped = mapSleeperInjuryStatus(sleeper?.injuryStatus);
    if (!mapped || mapped === "ACTIVE") return p;
    return {
      ...p,
      injuryStatus: moreSeriousInjuryStatus(p.injuryStatus, mapped),
    };
  });
}
