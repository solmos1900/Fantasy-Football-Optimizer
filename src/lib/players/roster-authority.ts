/**
 * Authoritative NFL team + picker eligibility for the no-league pool.
 *
 * Primary: Sleeper /players/nfl (team + status + active).
 * Cross-check: nflverse players.csv (latest_team + status + espn_id).
 * Never treat an NFL-rostered player as FA.
 */

import { loadSleeperRosterDirectory, type SleeperRosterPlayer } from "@/lib/sleeper/players";
import { loadPlayerIdCrosswalk } from "@/lib/nflverse/crosswalk";
import { sleeperNameTeamKey } from "@/lib/sleeper/projections";
import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";

export type AuthoritativeRosterEntry = {
  espnId: number;
  name: string;
  position: string;
  /** Canonical NFL team; never "FA" when rostered on Sleeper or nflverse ACT. */
  nflTeam: string;
  sleeperId: string | null;
  gsisId: string | null;
  /** Eligible for Trade / Who-to-Start pickers. */
  pickerEligible: boolean;
  /** Why excluded from pickers (when pickerEligible is false). */
  excludeReason: string | null;
  sleeperTeam: string | null;
  nflverseTeam: string | null;
  teamMismatch: boolean;
};

function cleanTeam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = normalizeNflAbbrev(raw.trim().toUpperCase());
  if (!t || t === "FA" || t === "NONE") return null;
  return t;
}

function nflverseActive(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toUpperCase();
  if (!s) return false;
  if (s === "ACT" || s === "ACTIVE") return true;
  // IR / PUP still on a roster — keep team, still picker-eligible if Sleeper agrees
  if (s === "INJURED RESERVE" || s === "IR" || s === "PUP" || s === "NFI") {
    return true;
  }
  return false;
}

/**
 * Build espnId → authoritative roster for skill players.
 * Prefer Sleeper team when present; else nflverse latest_team when ACT.
 */
export async function buildAuthoritativeRosterMap(options?: {
  forceRefresh?: boolean;
}): Promise<{
  byEspnId: Map<number, AuthoritativeRosterEntry>;
  fetchedAt: string;
  sleeperSkillActiveWithTeam: number;
  nflverseActWithTeam: number;
}> {
  const [sleeper, crosswalk] = await Promise.all([
    loadSleeperRosterDirectory({ forceRefresh: options?.forceRefresh }),
    loadPlayerIdCrosswalk(),
  ]);

  // nflverse meta is keyed by gsis — invert to espn
  type NvMeta = {
    name: string;
    position: string;
    nflTeam: string | null;
    status: string | null;
    gsisId: string;
  };
  const nvByEspn = new Map<number, NvMeta>();
  let nflverseActWithTeam = 0;

  // Re-read status from players.csv via crosswalk meta (latest_team only today).
  // Enrich by scanning crosswalk meta + espn map.
  for (const [gsisId, meta] of crosswalk.meta) {
    const espnId = crosswalk.gsisToEspn.get(gsisId);
    if (espnId == null) continue;
    const team = cleanTeam(meta.nflTeam);
    const status = (meta.status ?? "").trim().toUpperCase() || null;
    // Skip clearly retired / past seasons with no team
    if (!team && status && !nflverseActive(status)) continue;
    const entry: NvMeta = {
      name: meta.name,
      position: meta.position,
      nflTeam: team,
      status: status ?? (team ? "ACT" : null),
      gsisId,
    };
    // Prefer ACT rows when duplicates exist
    const prev = nvByEspn.get(espnId);
    if (
      !prev ||
      (nflverseActive(status) && !nflverseActive(prev.status)) ||
      (team && !prev.nflTeam)
    ) {
      nvByEspn.set(espnId, entry);
    }
    if (team && nflverseActive(status ?? "ACT")) nflverseActWithTeam += 1;
  }

  const byEspnId = new Map<number, AuthoritativeRosterEntry>();

  const sleeperByName = new Map<string, SleeperRosterPlayer>();
  for (const p of sleeper.allSkill) {
    sleeperByName.set(sleeperNameTeamKey(p.name, p.team), p);
    // Also index by name alone for espn-less Sleeper rows matched via nflverse
    const nameOnly = sleeperNameTeamKey(p.name, null);
    if (!sleeperByName.has(nameOnly)) sleeperByName.set(nameOnly, p);
  }

  let sleeperSkillActiveWithTeam = 0;
  for (const p of sleeper.allSkill) {
    if (p.active && p.team) sleeperSkillActiveWithTeam += 1;
  }

  // Union of espn ids from Sleeper + nflverse
  const espnIds = new Set<number>([
    ...sleeper.byEspnId.keys(),
    ...nvByEspn.keys(),
  ]);

  // Sleeper players missing espn_id: attach via nflverse name match
  for (const p of sleeper.allSkill) {
    if (p.espnId != null) continue;
    // Find nflverse espn by display name
    for (const [espnId, nv] of nvByEspn) {
      if (nv.name.toLowerCase() === p.name.toLowerCase()) {
        if (!sleeper.byEspnId.has(espnId)) {
          sleeper.byEspnId.set(espnId, { ...p, espnId });
          espnIds.add(espnId);
        }
        break;
      }
    }
  }

  for (const espnId of espnIds) {
    const sl = sleeper.byEspnId.get(espnId) ?? null;
    const nv = nvByEspn.get(espnId) ?? null;
    const sleeperTeam = cleanTeam(sl?.team);
    const nflverseTeam = cleanTeam(nv?.nflTeam);

    // Never FA when either source says rostered on a team
    let nflTeam = sleeperTeam ?? nflverseTeam;
    if (!nflTeam) {
      // Truly unrostered
      const name = sl?.name ?? nv?.name ?? `espn-${espnId}`;
      const position = (sl?.position ?? nv?.position ?? "WR").toUpperCase();
      byEspnId.set(espnId, {
        espnId,
        name,
        position,
        nflTeam: "FA",
        sleeperId: sl?.sleeperId ?? null,
        gsisId: nv?.gsisId ?? crosswalk.espnToGsis.get(espnId) ?? null,
        pickerEligible: false,
        excludeReason: "No 2026 NFL team (unsigned / free agent)",
        sleeperTeam,
        nflverseTeam,
        teamMismatch: false,
      });
      continue;
    }

    const teamMismatch =
      sleeperTeam != null &&
      nflverseTeam != null &&
      sleeperTeam !== nflverseTeam;

    // Prefer Sleeper when both present and disagree — log mismatch separately
    if (sleeperTeam) nflTeam = sleeperTeam;

    const sleeperOk = sl ? sl.active && sleeperTeam != null : false;
    const nvOk = nflverseTeam != null && nflverseActive(nv?.status);
    const pickerEligible = sleeperOk || (nvOk && (sl == null || sl.active !== false));

    let excludeReason: string | null = null;
    if (!pickerEligible) {
      if (sl && !sl.active) {
        excludeReason = `Inactive on Sleeper (${sl.status})`;
      } else if (!sleeperTeam && !nflverseTeam) {
        excludeReason = "No NFL team";
      } else {
        excludeReason = "Not on an active NFL roster";
      }
    }

    const name = sl?.name ?? nv?.name ?? `espn-${espnId}`;
    const position = (sl?.position ?? nv?.position ?? "WR").toUpperCase();

    byEspnId.set(espnId, {
      espnId,
      name,
      position,
      nflTeam,
      sleeperId: sl?.sleeperId ?? null,
      gsisId: nv?.gsisId ?? crosswalk.espnToGsis.get(espnId) ?? null,
      pickerEligible,
      excludeReason,
      sleeperTeam,
      nflverseTeam,
      teamMismatch,
    });
  }

  return {
    byEspnId,
    fetchedAt: sleeper.fetchedAt,
    sleeperSkillActiveWithTeam,
    nflverseActWithTeam,
  };
}

/** Apply authoritative team + drop ineligible players from a pool list. */
export function applyRosterAuthorityToPool<
  T extends { espnId: number; name: string; nflTeam: string },
>(
  players: T[],
  roster: Map<number, AuthoritativeRosterEntry>,
): { players: T[]; excluded: number; teamCorrections: number } {
  let excluded = 0;
  let teamCorrections = 0;
  const out: T[] = [];
  for (const p of players) {
    const auth = roster.get(p.espnId);
    if (!auth) {
      // No authority row — keep only if already has a real team
      const team = cleanTeam(p.nflTeam);
      if (!team) {
        excluded += 1;
        continue;
      }
      out.push(p);
      continue;
    }
    if (!auth.pickerEligible) {
      excluded += 1;
      continue;
    }
    if (cleanTeam(p.nflTeam) !== auth.nflTeam) {
      teamCorrections += 1;
    }
    out.push({ ...p, nflTeam: auth.nflTeam, name: auth.name || p.name });
  }
  return { players: out, excluded, teamCorrections };
}
