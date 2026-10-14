/**
 * Authoritative NFL team + picker eligibility for the no-league pool.
 *
 * Identity: join Sleeper ↔ nflverse weekly roster on sleeper_id (never name
 * when sleeper_id exists — Justin Jefferson WR vs LB). Fallbacks: gsis_id,
 * then unique name|pos only for weekly rows missing sleeper_id.
 *
 * Team: most recent transaction / news wins. Stale pre-season Sleeper data
 * without a 2026 weekly row → FA. Same-team CUT vs Sleeper → FA + DataIssue.
 * Post-cut signing to a different team → Sleeper wins (single-source notice).
 */

import {
  loadSleeperRosterDirectory,
  type SleeperRosterPlayer,
} from "@/lib/sleeper/players";
import {
  isOnClubStatus,
  isPickerClubStatus,
  isPracticeSquadStatus,
  loadNflverseWeeklyRoster,
  normalizePlayerNameKey,
  type NflverseWeeklyRosterRow,
} from "@/lib/nflverse/weekly-roster";
import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";
import { defaultEspnSeason } from "@/lib/season";
import { loadPlayerIdCrosswalk } from "@/lib/nflverse/crosswalk";

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
   * True for same-identity conflicts that need a UI notice (pending same-day,
   * or Sleeper still lists a team that nflverse shows as CUT).
   */
  teamMismatch: boolean;
  /** Evidence / resolution notes for audits. */
  evidence: string | null;
  /** Pending same-day move that needs a UI notice. */
  pendingSameDay: boolean;
  /** Team came from Sleeper only (e.g. post-cut signing). */
  singleSourceTeam: boolean;
  /** Practice squad (nflverse DEV or Sleeper-only unconfirmed PS). */
  practiceSquad: boolean;
  /** Pre-2026 Sleeper news with no 2026 weekly confirmation. */
  staleSleeper: boolean;
};

function cleanTeam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = normalizeNflAbbrev(raw.trim().toUpperCase());
  if (!t || t === "FA" || t === "NONE") return null;
  return t;
}

/** Season start ≈ Sep 1 UTC — Sleeper news before this is not current-season. */
function seasonStartMs(season: number): number {
  return Date.UTC(season, 8, 1);
}

function weeklyRosterApproxMs(season: number, week: number): number {
  return seasonStartMs(season) + week * 7 * 24 * 60 * 60 * 1000;
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

function isStaleSleeperNews(
  sleeper: SleeperRosterPlayer | null,
  season: number,
): boolean {
  if (!sleeper) return false;
  const news = sleeper.newsUpdatedMs;
  if (news == null || news <= 0) return true;
  return news < seasonStartMs(season);
}

type ResolveResult = {
  nflTeam: string | null;
  teamMismatch: boolean;
  pendingSameDay: boolean;
  evidence: string;
  sleeperTeam: string | null;
  nflverseTeam: string | null;
  singleSourceTeam: boolean;
  practiceSquad: boolean;
  staleSleeper: boolean;
};

function resolveTeam(options: {
  sleeper: SleeperRosterPlayer | null;
  weekly: NflverseWeeklyRosterRow | null;
  season: number;
  nowMs: number;
}): ResolveResult {
  const sleeperTeam = cleanTeam(options.sleeper?.team);
  const weeklyStatus = options.weekly?.status ?? "";
  const weeklyTeamRaw = cleanTeam(options.weekly?.team);
  const weeklyOnClub =
    options.weekly != null && isOnClubStatus(options.weekly.status);
  const nflverseTeam = weeklyOnClub ? weeklyTeamRaw : null;
  const stale = isStaleSleeperNews(options.sleeper, options.season);
  const practiceFromWeekly =
    options.weekly != null && isPracticeSquadStatus(options.weekly.status);

  // Stale Sleeper (pre-season news) with no 2026 weekly on-club row → FA
  if (stale && !weeklyOnClub) {
    const cutNote =
      options.weekly && !weeklyOnClub
        ? `; nflverse week ${options.weekly.week} ${options.weekly.team} ${weeklyStatus}`
        : "; no 2026 nflverse weekly row";
    return {
      nflTeam: null,
      teamMismatch: false,
      pendingSameDay: false,
      evidence: `stale Sleeper (news ${options.sleeper?.newsUpdatedMs ? new Date(options.sleeper.newsUpdatedMs).toISOString() : "—"}${cutNote}) — treat as inactive/FA`,
      sleeperTeam,
      nflverseTeam: null,
      singleSourceTeam: false,
      practiceSquad: false,
      staleSleeper: true,
    };
  }

  // Same-team CUT: Sleeper still lists the team that nflverse shows as CUT →
  // not a post-cut signing elsewhere. Flag DataIssue; exclude from pool.
  if (
    options.weekly &&
    !weeklyOnClub &&
    (weeklyStatus === "CUT" || weeklyStatus === "EXE") &&
    sleeperTeam &&
    weeklyTeamRaw &&
    sleeperTeam === weeklyTeamRaw
  ) {
    return {
      nflTeam: null,
      teamMismatch: true,
      pendingSameDay: false,
      evidence: `nflverse week ${options.weekly.week} ${weeklyTeamRaw} ${weeklyStatus}; Sleeper still ${sleeperTeam} — not rostered; DataIssue`,
      sleeperTeam,
      nflverseTeam: null,
      singleSourceTeam: false,
      practiceSquad: false,
      staleSleeper: false,
    };
  }

  type TeamClaim = {
    team: string;
    atMs: number;
    source: "sleeper" | "nflverse_weekly";
    status: string;
  };
  const onClubClaims: TeamClaim[] = [];
  if (options.sleeper?.active && sleeperTeam && !stale) {
    onClubClaims.push({
      team: sleeperTeam,
      atMs: options.sleeper.newsUpdatedMs ?? 0,
      source: "sleeper",
      status: options.sleeper.status,
    });
  }
  if (weeklyOnClub && weeklyTeamRaw) {
    onClubClaims.push({
      team: weeklyTeamRaw,
      atMs: weeklyRosterApproxMs(options.season, options.weekly!.week),
      source: "nflverse_weekly",
      status: weeklyStatus,
    });
  }
  onClubClaims.sort((a, b) => b.atMs - a.atMs);

  if (onClubClaims.length === 0) {
    return {
      nflTeam: null,
      teamMismatch: false,
      pendingSameDay: false,
      evidence:
        options.weekly && !weeklyOnClub
          ? `nflverse week ${options.weekly.week} status ${weeklyStatus} (not on club); Sleeper team ${sleeperTeam ?? "—"}`
          : `no on-club team (Sleeper ${sleeperTeam ?? "—"}, weekly ${options.weekly?.team ?? "—"})`,
      sleeperTeam,
      nflverseTeam,
      singleSourceTeam: false,
      practiceSquad: false,
      staleSleeper: stale,
    };
  }

  const winner = onClubClaims[0]!;
  let nflTeam: string | null = winner.team;
  let evidence = `resolved ${nflTeam} via ${winner.source} @ ${winner.atMs > 0 ? new Date(winner.atMs).toISOString() : "unknown"}`;
  let teamMismatch = false;
  let pendingSameDay = false;
  let singleSourceTeam = false;

  // Post-cut signing: weekly CUT on team X, Sleeper on team Y ≠ X
  if (
    options.weekly &&
    !weeklyOnClub &&
    (weeklyStatus === "CUT" || weeklyStatus === "EXE") &&
    sleeperTeam &&
    weeklyTeamRaw &&
    sleeperTeam !== weeklyTeamRaw
  ) {
    nflTeam = sleeperTeam;
    singleSourceTeam = true;
    evidence = `post-cut signing (single-source Sleeper): nflverse week ${options.weekly.week} ${weeklyTeamRaw} ${weeklyStatus}; Sleeper ${sleeperTeam} @ ${options.sleeper?.newsUpdatedMs ? new Date(options.sleeper.newsUpdatedMs).toISOString() : "—"}`;
  } else if (
    onClubClaims.length >= 2 &&
    onClubClaims[0]!.team !== onClubClaims[1]!.team
  ) {
    const a = onClubClaims[0]!;
    const b = onClubClaims[1]!;
    const sleeperClaim = onClubClaims.find((c) => c.source === "sleeper");
    const recentPending =
      (sleeperClaim?.atMs != null &&
        sleeperClaim.atMs > 0 &&
        isRecentUtcDay(sleeperClaim.atMs, options.nowMs)) ||
      (a.atMs > 0 && b.atMs > 0 && sameUtcDay(a.atMs, b.atMs));
    if (recentPending) {
      teamMismatch = true;
      pendingSameDay = true;
      evidence = `pending same-day: Sleeper ${sleeperTeam} vs nflverse ${nflverseTeam} week ${options.weekly?.week ?? "?"} ${weeklyStatus}; using most recent ${nflTeam}`;
    } else {
      evidence = `most-recent wins: Sleeper ${sleeperTeam} vs nflverse ${nflverseTeam} week ${options.weekly?.week ?? "?"} ${weeklyStatus}; chose ${nflTeam}`;
    }
  } else if (sleeperTeam && nflverseTeam && sleeperTeam === nflverseTeam) {
    evidence = `Sleeper+nflverse agree ${nflTeam} (week ${options.weekly?.week ?? "?"}${practiceFromWeekly ? ", DEV practice squad" : ""})`;
  } else if (winner.source === "sleeper" && !weeklyOnClub) {
    // Current-season Sleeper team with no weekly on-club confirmation
    singleSourceTeam = true;
    evidence = `single-source Sleeper ${sleeperTeam} @ ${options.sleeper?.newsUpdatedMs ? new Date(options.sleeper.newsUpdatedMs).toISOString() : "—"} (no 2026 weekly on-club row)`;
  }

  // Practice squad: nflverse DEV, or Sleeper-only current-season team with no
  // weekly on-club row. Post-cut signings to a *different* team are not PS.
  const postCutNewTeam =
    Boolean(options.weekly) &&
    !weeklyOnClub &&
    (weeklyStatus === "CUT" || weeklyStatus === "EXE") &&
    Boolean(sleeperTeam) &&
    Boolean(weeklyTeamRaw) &&
    sleeperTeam !== weeklyTeamRaw;
  const practiceSquad =
    practiceFromWeekly ||
    (singleSourceTeam && !weeklyOnClub && !postCutNewTeam);

  return {
    nflTeam,
    teamMismatch,
    pendingSameDay,
    evidence,
    sleeperTeam,
    nflverseTeam,
    singleSourceTeam,
    practiceSquad,
    staleSleeper: false,
  };
}

function lookupWeekly(
  sl: SleeperRosterPlayer,
  weekly: Awaited<ReturnType<typeof loadNflverseWeeklyRoster>>,
): NflverseWeeklyRosterRow | null {
  const bySid = weekly.bySleeperId.get(sl.sleeperId);
  if (bySid) return bySid;
  const gsis = (sl.gsisId ?? "").trim();
  if (gsis) {
    const byGsis = weekly.byGsisId.get(gsis);
    if (byGsis) return byGsis;
  }
  // Name|pos only when weekly row has no sleeper_id (avoid WR/LB collisions)
  const key = `${normalizePlayerNameKey(sl.name)}|${sl.position.toUpperCase()}`;
  const byName = weekly.byNamePosUnique.get(key);
  if (byName && !byName.sleeperId) return byName;
  return null;
}

/**
 * Build espnId → authoritative roster for skill players.
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
  singleSourceCount: number;
  practiceSquadCount: number;
}> {
  const season = defaultEspnSeason();
  const nowMs = Date.now();
  const [sleeper, weekly, crosswalk] = await Promise.all([
    loadSleeperRosterDirectory({ forceRefresh: options?.forceRefresh }),
    loadNflverseWeeklyRoster({ season }),
    loadPlayerIdCrosswalk(),
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
  let singleSourceCount = 0;
  let practiceSquadCount = 0;

  const putEntry = (entry: AuthoritativeRosterEntry) => {
    if (entry.sleeperId) bySleeperId.set(entry.sleeperId, entry);
    const prev = byEspnId.get(entry.espnId);
    if (!prev || (entry.sleeperId && !prev.sleeperId)) {
      byEspnId.set(entry.espnId, entry);
    } else if (prev.sleeperId === entry.sleeperId) {
      byEspnId.set(entry.espnId, entry);
    }
  };

  for (const sl of sleeper.allSkill) {
    const wk = lookupWeekly(sl, weekly);
    // Canonical espn: weekly → Sleeper → crosswalk via weekly gsis
    let espnId = wk?.espnId ?? sl.espnId ?? null;
    if (espnId == null && wk?.gsisId) {
      espnId = crosswalk.gsisToEspn.get(wk.gsisId) ?? null;
    }
    if (espnId == null || espnId <= 0) {
      continue;
    }

    const resolved = resolveTeam({ sleeper: sl, weekly: wk, season, nowMs });
    const name = wk?.name || sl.name;
    const position = (wk?.position || sl.position).toUpperCase();
    const gsisId = wk?.gsisId ?? sl.gsisId;

    let pickerEligible = false;
    let excludeReason: string | null = null;
    if (resolved.staleSleeper) {
      pickerEligible = false;
      excludeReason =
        "Stale Sleeper roster (pre-2026 news, no current weekly confirmation)";
    } else if (resolved.nflTeam) {
      const sleeperOk =
        sl.active && resolved.sleeperTeam != null && !resolved.staleSleeper;
      const weeklyOk =
        wk != null &&
        isPickerClubStatus(wk.status) &&
        cleanTeam(wk.team) != null;
      pickerEligible = sleeperOk || (weeklyOk && sl.active !== false);
      if (!pickerEligible) {
        excludeReason = !sl.active
          ? `Inactive on Sleeper (${sl.status})`
          : "Not on an active NFL roster";
      }
    } else {
      excludeReason = resolved.teamMismatch
        ? "nflverse CUT / released — excluded pending confirmation"
        : "No 2026 NFL team (unsigned / free agent)";
    }

    if (resolved.teamMismatch) teamMismatchCount += 1;
    if (resolved.pendingSameDay) pendingSameDayCount += 1;
    if (resolved.singleSourceTeam) singleSourceCount += 1;
    if (resolved.practiceSquad) practiceSquadCount += 1;

    putEntry({
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
      singleSourceTeam: resolved.singleSourceTeam,
      practiceSquad: resolved.practiceSquad,
      staleSleeper: resolved.staleSleeper,
    });
  }

  // Weekly rows with sleeper_id not already covered
  for (const [sid, wk] of weekly.bySleeperId) {
    if (bySleeperId.has(sid)) continue;
    const espnId =
      wk.espnId ??
      (wk.gsisId ? crosswalk.gsisToEspn.get(wk.gsisId) : null) ??
      null;
    if (espnId == null) continue;
    if (byEspnId.has(espnId)) continue;
    const onClub = isOnClubStatus(wk.status) && cleanTeam(wk.team);
    const practiceSquad = isPracticeSquadStatus(wk.status);
    putEntry({
      espnId,
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
      singleSourceTeam: false,
      practiceSquad,
      staleSleeper: false,
    });
    if (practiceSquad) practiceSquadCount += 1;
  }

  // espn / gsis weekly fills (sid-less rows like Gordon / Lang)
  for (const wk of weekly.byGsisId.values()) {
    const espnId =
      wk.espnId ??
      (wk.gsisId ? crosswalk.gsisToEspn.get(wk.gsisId) : null) ??
      null;
    if (espnId == null) continue;
    if (byEspnId.has(espnId)) continue;
    const onClub = isOnClubStatus(wk.status) && cleanTeam(wk.team);
    const practiceSquad = isPracticeSquadStatus(wk.status);
    // CUT-only weekly with no Sleeper → FA
    putEntry({
      espnId,
      name: wk.name,
      position: wk.position,
      nflTeam: onClub ? cleanTeam(wk.team)! : "FA",
      sleeperId: wk.sleeperId,
      gsisId: wk.gsisId,
      pickerEligible: Boolean(onClub && isPickerClubStatus(wk.status)),
      excludeReason: onClub
        ? null
        : `nflverse week ${wk.week} status ${wk.status}`,
      sleeperTeam: null,
      nflverseTeam: onClub ? cleanTeam(wk.team) : null,
      teamMismatch: false,
      evidence: `weekly gsis-only week ${wk.week} ${wk.team} ${wk.status}`,
      pendingSameDay: false,
      singleSourceTeam: false,
      practiceSquad,
      staleSleeper: false,
    });
    if (practiceSquad) practiceSquadCount += 1;
  }

  return {
    byEspnId,
    bySleeperId,
    fetchedAt: sleeper.fetchedAt,
    sleeperSkillActiveWithTeam,
    nflverseActWithTeam,
    teamMismatchCount,
    pendingSameDayCount,
    singleSourceCount,
    practiceSquadCount,
  };
}

/** Apply authoritative team + drop ineligible players from a pool list. */
export function applyRosterAuthorityToPool<
  T extends {
    espnId: number;
    name: string;
    nflTeam: string;
    practiceSquad?: boolean;
    singleSourceTeam?: boolean;
  },
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
    out.push({
      ...p,
      nflTeam: auth.nflTeam,
      name: auth.name || p.name,
      practiceSquad: auth.practiceSquad,
      singleSourceTeam: auth.singleSourceTeam,
    });
  }
  return { players: out, excluded, teamCorrections };
}
