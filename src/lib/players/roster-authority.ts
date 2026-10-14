/**
 * Authoritative NFL team + picker eligibility for the no-league pool.
 *
 * Identity: join Sleeper ↔ nflverse weekly roster on sleeper_id (never name).
 * Team: most recent transaction / news wins (Sleeper news_updated vs weekly week).
 * Never treat an NFL-rostered player as FA.
 */

import {
  loadSleeperRosterDirectory,
  type SleeperRosterPlayer,
} from "@/lib/sleeper/players";
import {
  isOnClubStatus,
  isPickerClubStatus,
  loadNflverseWeeklyRoster,
  type NflverseWeeklyRosterRow,
} from "@/lib/nflverse/weekly-roster";
import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";
import { defaultEspnSeason } from "@/lib/season";

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
  /**
   * True only for unexplained same-identity team conflicts (typically same-day
   * pending moves). Identity collisions are NOT mismatches.
   */
  teamMismatch: boolean;
  /** Evidence / resolution notes for audits. */
  evidence: string | null;
  /** Pending same-day move that needs a UI notice. */
  pendingSameDay: boolean;
};

function cleanTeam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = normalizeNflAbbrev(raw.trim().toUpperCase());
  if (!t || t === "FA" || t === "NONE") return null;
  return t;
}

/** Approximate end-of-week timestamp for nflverse weekly roster rows. */
function weeklyRosterApproxMs(season: number, week: number): number {
  // NFL regular season roughly starts first Thursday after Labor Day.
  // 2025: Sep 4; 2026: Sep 10. Use Sep 1 + (week)*7d as a stable lower bound;
  // Sleeper news_updated for mid-week moves will still beat prior weeks.
  const seasonStart = Date.UTC(season, 8, 1); // Sep 1 UTC
  return seasonStart + week * 7 * 24 * 60 * 60 * 1000;
}

function sameUtcDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function isRecentUtcDay(ms: number, nowMs: number): boolean {
  return sameUtcDay(ms, nowMs);
}

type TeamClaim = {
  team: string | null;
  atMs: number;
  source: "sleeper" | "nflverse_weekly";
  onClub: boolean;
  status: string;
};

function resolveTeam(options: {
  sleeper: SleeperRosterPlayer | null;
  weekly: NflverseWeeklyRosterRow | null;
  season: number;
  nowMs: number;
}): {
  nflTeam: string | null;
  teamMismatch: boolean;
  pendingSameDay: boolean;
  evidence: string;
  sleeperTeam: string | null;
  nflverseTeam: string | null;
} {
  const sleeperTeam = cleanTeam(options.sleeper?.team);
  const weeklyOnClub =
    options.weekly != null && isOnClubStatus(options.weekly.status);
  const nflverseTeam = weeklyOnClub
    ? cleanTeam(options.weekly?.team)
    : null;
  const weeklyStatus = options.weekly?.status ?? "";

  const claims: TeamClaim[] = [];
  if (options.sleeper) {
    claims.push({
      team: sleeperTeam,
      atMs: options.sleeper.newsUpdatedMs ?? 0,
      source: "sleeper",
      onClub: Boolean(options.sleeper.active && sleeperTeam),
      status: options.sleeper.status,
    });
  }
  if (options.weekly) {
    claims.push({
      team: cleanTeam(options.weekly.team),
      atMs: weeklyRosterApproxMs(options.season, options.weekly.week),
      source: "nflverse_weekly",
      onClub: weeklyOnClub,
      status: weeklyStatus,
    });
  }

  // Prefer most recent on-club claim; if weekly is CUT and Sleeper has a team,
  // Sleeper is a post-cut signing and wins when its news is at/after that week.
  const onClubClaims = claims.filter((c) => c.onClub && c.team);
  onClubClaims.sort((a, b) => b.atMs - a.atMs);

  let nflTeam: string | null = onClubClaims[0]?.team ?? null;
  let evidence = "";
  let teamMismatch = false;
  let pendingSameDay = false;

  if (onClubClaims.length === 0) {
    evidence =
      options.weekly && !weeklyOnClub
        ? `nflverse week ${options.weekly.week} status ${weeklyStatus} (not on club); Sleeper team ${sleeperTeam ?? "—"}`
        : `no on-club team (Sleeper ${sleeperTeam ?? "—"}, weekly ${options.weekly?.team ?? "—"})`;
    return {
      nflTeam: null,
      teamMismatch: false,
      pendingSameDay: false,
      evidence,
      sleeperTeam,
      nflverseTeam,
    };
  }

  const winner = onClubClaims[0]!;
  nflTeam = winner.team;
  const winnerNews =
    winner.atMs > 0 ? new Date(winner.atMs).toISOString() : "unknown";
  evidence = `resolved ${nflTeam} via ${winner.source} @ ${winnerNews}`;

  // True conflict: two on-club teams for the SAME sleeper identity.
  if (
    onClubClaims.length >= 2 &&
    onClubClaims[0]!.team !== onClubClaims[1]!.team
  ) {
    const a = onClubClaims[0]!;
    const b = onClubClaims[1]!;
    const sleeperClaim = claims.find((c) => c.source === "sleeper");
    const weeklyClaim = claims.find((c) => c.source === "nflverse_weekly");

    // Post-cut signing: weekly not on club (CUT) already filtered; both on-club.
    const recentPending =
      (sleeperClaim?.atMs != null &&
        sleeperClaim.atMs > 0 &&
        isRecentUtcDay(sleeperClaim.atMs, options.nowMs)) ||
      (a.atMs > 0 && b.atMs > 0 && sameUtcDay(a.atMs, b.atMs));

    if (recentPending) {
      teamMismatch = true;
      pendingSameDay = true;
      evidence = `pending same-day: Sleeper ${sleeperTeam} (${sleeperClaim?.atMs ? new Date(sleeperClaim.atMs).toISOString() : "—"}) vs nflverse ${nflverseTeam} week ${options.weekly?.week ?? "?"} ${weeklyStatus}; using most recent ${nflTeam}`;
    } else {
      evidence = `most-recent wins: Sleeper ${sleeperTeam} @ ${sleeperClaim?.atMs ? new Date(sleeperClaim.atMs).toISOString() : "—"} vs nflverse ${weeklyClaim?.team ?? "—"} week ${options.weekly?.week ?? "?"} ${weeklyStatus}; chose ${nflTeam}`;
    }
  } else if (
    options.weekly &&
    !weeklyOnClub &&
    sleeperTeam &&
    cleanTeam(options.weekly.team) &&
    cleanTeam(options.weekly.team) !== sleeperTeam
  ) {
    // e.g. Jared Wayne: HOU CUT week 6, Sleeper MIA — Sleeper is post-cut signing
    evidence = `post-cut signing: nflverse week ${options.weekly.week} ${options.weekly.team} ${weeklyStatus}; Sleeper ${sleeperTeam} @ ${options.sleeper?.newsUpdatedMs ? new Date(options.sleeper.newsUpdatedMs).toISOString() : "—"}; chose ${nflTeam}`;
  } else if (sleeperTeam && nflverseTeam && sleeperTeam === nflverseTeam) {
    evidence = `Sleeper+nflverse agree ${nflTeam} (week ${options.weekly?.week ?? "?"})`;
  }

  return {
    nflTeam,
    teamMismatch,
    pendingSameDay,
    evidence,
    sleeperTeam,
    nflverseTeam,
  };
}

/**
 * Build espnId → authoritative roster for skill players.
 * Join on sleeper_id; prefer weekly roster espn_id over Sleeper's (often wrong).
 */
export async function buildAuthoritativeRosterMap(options?: {
  forceRefresh?: boolean;
}): Promise<{
  byEspnId: Map<number, AuthoritativeRosterEntry>;
  bySleeperId: Map<string, AuthoritativeRosterEntry>;
  fetchedAt: string;
  sleeperSkillActiveWithTeam: number;
  nflverseActWithTeam: number;
  teamMismatchCount: number;
  pendingSameDayCount: number;
}> {
  const season = defaultEspnSeason();
  const nowMs = Date.now();
  const [sleeper, weekly] = await Promise.all([
    loadSleeperRosterDirectory({ forceRefresh: options?.forceRefresh }),
    loadNflverseWeeklyRoster({ season }),
  ]);

  let sleeperSkillActiveWithTeam = 0;
  for (const p of sleeper.allSkill) {
    if (p.active && p.team) sleeperSkillActiveWithTeam += 1;
  }

  let nflverseActWithTeam = 0;
  for (const row of weekly.bySleeperId.values()) {
    if (row.team && isOnClubStatus(row.status)) nflverseActWithTeam += 1;
  }

  const byEspnId = new Map<number, AuthoritativeRosterEntry>();
  const bySleeperId = new Map<string, AuthoritativeRosterEntry>();
  let teamMismatchCount = 0;
  let pendingSameDayCount = 0;

  // Index weekly rows that lack sleeper_id by espn for fill-in only
  const weeklyByEspnOnly = weekly.byEspnId;

  for (const sl of sleeper.allSkill) {
    const wk = weekly.bySleeperId.get(sl.sleeperId) ?? null;
    // Canonical espn: weekly (identity-safe) first, else Sleeper
    const espnId = wk?.espnId ?? sl.espnId;
    if (espnId == null || espnId <= 0) {
      // No stable espn key — skip map (pool/DB are espn-keyed). Still track by sleeper.
      const resolved = resolveTeam({ sleeper: sl, weekly: wk, season, nowMs });
      if (!resolved.nflTeam) continue;
      // Without espnId we cannot attach to FantasyPlayer pool; skip.
      continue;
    }

    // If Sleeper's espn_id disagrees with weekly's for this sleeper_id, ignore
    // Sleeper's espn for indexing (prevents Ryan Izzo / Conklin collisions).
    const resolved = resolveTeam({ sleeper: sl, weekly: wk, season, nowMs });
    const name = wk?.name || sl.name;
    const position = (wk?.position || sl.position).toUpperCase();
    const gsisId = wk?.gsisId ?? sl.gsisId;

    let pickerEligible = false;
    let excludeReason: string | null = null;
    if (resolved.nflTeam) {
      const sleeperOk = sl.active && resolved.sleeperTeam != null;
      const weeklyOk =
        wk != null &&
        isPickerClubStatus(wk.status) &&
        cleanTeam(wk.team) != null;
      pickerEligible = sleeperOk || (weeklyOk && sl.active !== false);
      if (!pickerEligible) {
        if (!sl.active) {
          excludeReason = `Inactive on Sleeper (${sl.status})`;
        } else {
          excludeReason = "Not on an active NFL roster";
        }
      }
    } else {
      excludeReason = "No 2026 NFL team (unsigned / free agent)";
    }

    if (resolved.teamMismatch) teamMismatchCount += 1;
    if (resolved.pendingSameDay) pendingSameDayCount += 1;

    const entry: AuthoritativeRosterEntry = {
      espnId,
      name,
      position,
      nflTeam: resolved.nflTeam ?? "FA",
      sleeperId: sl.sleeperId,
      gsisId,
      pickerEligible,
      excludeReason,
      sleeperTeam: resolved.sleeperTeam,
      nflverseTeam: resolved.nflverseTeam,
      teamMismatch: resolved.teamMismatch,
      evidence: resolved.evidence,
      pendingSameDay: resolved.pendingSameDay,
    };

    bySleeperId.set(sl.sleeperId, entry);
    // Prefer entry that has sleeper join when colliding on espn
    const prev = byEspnId.get(espnId);
    if (!prev || (entry.sleeperId && !prev.sleeperId)) {
      byEspnId.set(espnId, entry);
    } else if (prev.sleeperId === entry.sleeperId) {
      byEspnId.set(espnId, entry);
    }
  }

  // Weekly-only skill players (no Sleeper skill row) — still register team
  for (const [sid, wk] of weekly.bySleeperId) {
    if (bySleeperId.has(sid)) continue;
    if (!wk.espnId) continue;
    if (byEspnId.has(wk.espnId)) continue;
    const onClub = isOnClubStatus(wk.status) && cleanTeam(wk.team);
    const entry: AuthoritativeRosterEntry = {
      espnId: wk.espnId,
      name: wk.name,
      position: wk.position,
      nflTeam: onClub ? cleanTeam(wk.team)! : "FA",
      sleeperId: sid,
      gsisId: wk.gsisId,
      pickerEligible: Boolean(onClub && isPickerClubStatus(wk.status)),
      excludeReason: onClub
        ? null
        : `nflverse week ${wk.week} status ${wk.status}`,
      sleeperTeam: null,
      nflverseTeam: onClub ? cleanTeam(wk.team) : null,
      teamMismatch: false,
      evidence: `weekly-only week ${wk.week} ${wk.team} ${wk.status}`,
      pendingSameDay: false,
    };
    byEspnId.set(wk.espnId, entry);
    bySleeperId.set(sid, entry);
  }

  // Fill espn-only weekly rows that never got a sleeper_id (rare)
  for (const [espnId, wk] of weeklyByEspnOnly) {
    if (byEspnId.has(espnId)) continue;
    const onClub = isOnClubStatus(wk.status) && cleanTeam(wk.team);
    byEspnId.set(espnId, {
      espnId,
      name: wk.name,
      position: wk.position,
      nflTeam: onClub ? cleanTeam(wk.team)! : "FA",
      sleeperId: wk.sleeperId,
      gsisId: wk.gsisId,
      pickerEligible: Boolean(onClub && isPickerClubStatus(wk.status)),
      excludeReason: onClub ? null : `nflverse week ${wk.week} status ${wk.status}`,
      sleeperTeam: null,
      nflverseTeam: onClub ? cleanTeam(wk.team) : null,
      teamMismatch: false,
      evidence: `weekly espn-only week ${wk.week}`,
      pendingSameDay: false,
    });
  }

  return {
    byEspnId,
    bySleeperId,
    fetchedAt: sleeper.fetchedAt,
    sleeperSkillActiveWithTeam,
    nflverseActWithTeam,
    teamMismatchCount,
    pendingSameDayCount,
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
