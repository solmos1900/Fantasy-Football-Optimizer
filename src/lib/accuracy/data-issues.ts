/**
 * Cross-source pool validation → DataIssue rows + UI summaries.
 */

import { prisma } from "@/lib/db";
import {
  buildAuthoritativeRosterMap,
  type AuthoritativeRosterEntry,
} from "@/lib/players/roster-authority";
import { NFLVERSE_LEAGUE_ID, NFLVERSE_SOURCE } from "@/lib/nflverse/map";
import { fullPprFromNflverseRow } from "@/lib/players/scoring";
import { fetchGunzipText, parseCsv } from "@/lib/nflverse/csv";
import { playerWeekStatsCsvGzUrl } from "@/lib/nflverse/urls";
import { defaultEspnSeason } from "@/lib/season";
import { loadPlayerIdCrosswalk } from "@/lib/nflverse/crosswalk";
import { nflTeamFullName } from "@/lib/espn/pro-teams";

export type DataIssueKind =
  | "team_mismatch"
  | "ppr_mismatch"
  | "roster_fa_conflict"
  | "projection_missing"
  | "single_source_team";

export type DataIssueSummary = {
  openCount: number;
  /** Plain-English notices for UI */
  notices: string[];
  byKind: Record<string, number>;
};

/** Human-readable notice for a DataIssue row (owner-facing). */
export function formatDataIssueNotice(row: {
  kind: string;
  playerName?: string | null;
  espnId?: number | null;
  detail?: string | null;
  sources?: string | null;
}): string {
  const who =
    row.playerName?.trim() ||
    (row.espnId ? `Player ${row.espnId}` : "A player");
  let sources: Record<string, unknown> = {};
  if (row.sources) {
    try {
      sources = JSON.parse(row.sources) as Record<string, unknown>;
    } catch {
      sources = {};
    }
  }
  const sleeperTeam = String(sources.sleeperTeam ?? "");
  const cutTeam =
    String(sources.cutTeam ?? sources.nflverseTeam ?? sleeperTeam ?? "") ||
    null;
  const resolved = String(sources.resolvedTeam ?? "");
  const week = sources.cutWeek != null ? Number(sources.cutWeek) : null;
  const practiceSquad = Boolean(sources.practiceSquad);

  if (row.kind === "team_mismatch") {
    const club = cutTeam ? nflTeamFullName(cutTeam) : "their club";
    const weekBit =
      week != null && Number.isFinite(week) ? ` in Week ${week}` : "";
    return `${who}: team unclear (${club} cut him${weekBit}), left out of player search`;
  }
  if (row.kind === "single_source_team") {
    const club = resolved
      ? nflTeamFullName(resolved)
      : sleeperTeam
        ? nflTeamFullName(sleeperTeam)
        : "an NFL team";
    const ps = practiceSquad ? " practice squad" : "";
    return `${who}: team not yet confirmed by a second source (listed with the ${club}${ps})`;
  }
  if (row.kind === "roster_fa_conflict") {
    const club = resolved
      ? nflTeamFullName(resolved)
      : String(sources.authTeam ?? "")
        ? nflTeamFullName(String(sources.authTeam))
        : "an NFL team";
    return `${who}: roster was marked free agent but he is listed with the ${club} — team corrected`;
  }
  if (row.kind === "ppr_mismatch") {
    return `${who}: scored points from one source do not match another — check before trusting totals`;
  }
  if (row.kind === "projection_missing") {
    return `${who}: no weekly projection available yet`;
  }
  return row.detail?.trim() || `${who}: data needs a review`;
}

function cutWeekFromEvidence(evidence: string | null | undefined): number | null {
  if (!evidence) return null;
  const m = evidence.match(/week\s+(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function cutTeamFromEvidence(
  entry: AuthoritativeRosterEntry,
): string | null {
  // Same-team CUT: sleeperTeam is the club that cut him
  if (entry.sleeperTeam) return entry.sleeperTeam;
  const m = entry.evidence?.match(
    /nflverse week \d+ ([A-Z]{2,3}) CUT/i,
  );
  return m?.[1] ?? null;
}

export async function loadOpenDataIssueSummary(options?: {
  limit?: number;
  /** When set, only count/show issues for these ESPN ids (players in the pool). */
  poolEspnIds?: Iterable<number>;
}): Promise<DataIssueSummary> {
  const limit = options?.limit ?? 12;
  const poolSet =
    options?.poolEspnIds != null
      ? new Set(
          [...options.poolEspnIds].filter((n) => Number.isFinite(n) && n > 0),
        )
      : null;

  const open = await prisma.dataIssue.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const relevant = open.filter((row) => {
    if (poolSet == null) return true;
    if (row.espnId == null) return false;
    return poolSet.has(row.espnId);
  });

  const byKind: Record<string, number> = {};
  for (const row of relevant) {
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
  }
  const ranked = [...relevant].sort((a, b) => {
    const rank = (k: string) =>
      k === "team_mismatch" ? 0 : k === "single_source_team" ? 1 : 2;
    return rank(a.kind) - rank(b.kind);
  });
  const notices = ranked.slice(0, limit).map((row) => formatDataIssueNotice(row));
  return { openCount: relevant.length, notices, byKind };
}

async function upsertIssue(input: {
  kind: DataIssueKind;
  espnId?: number | null;
  playerName?: string | null;
  season?: number | null;
  week?: number | null;
  detail: string;
  sources?: Record<string, unknown>;
}) {
  const existing = await prisma.dataIssue.findFirst({
    where: {
      resolved: false,
      kind: input.kind,
      espnId: input.espnId ?? undefined,
      week: input.week ?? undefined,
      season: input.season ?? undefined,
    },
  });
  const sources = input.sources ? JSON.stringify(input.sources) : null;
  if (existing) {
    await prisma.dataIssue.update({
      where: { id: existing.id },
      data: {
        detail: input.detail,
        sources,
        playerName: input.playerName ?? existing.playerName,
        updatedAt: new Date(),
      },
    });
    return existing.id;
  }
  const created = await prisma.dataIssue.create({
    data: {
      kind: input.kind,
      espnId: input.espnId ?? null,
      playerName: input.playerName ?? null,
      season: input.season ?? null,
      week: input.week ?? null,
      detail: input.detail,
      sources,
    },
  });
  return created.id;
}

/**
 * Cron step: compare Sleeper ↔ nflverse teams for rostered players,
 * correct FA conflicts in DB, and recompute nflverse box-score PPR vs stored.
 */
export async function runPoolDataValidation(options?: {
  season?: number;
  week?: number;
}): Promise<{
  teamMismatches: number;
  pprMismatches: number;
  faConflicts: number;
  checkedPlayers: number;
  teamsCorrected: number;
  issuesResolved: number;
}> {
  const season = options?.season ?? defaultEspnSeason();
  const roster = await buildAuthoritativeRosterMap({ forceRefresh: true });
  let teamMismatches = 0;
  let faConflicts = 0;
  let teamsCorrected = 0;
  let checkedPlayers = 0;

  const authEntries = [...roster.byEspnId.values()];
  const authByEspn = roster.byEspnId;
  const espnIds = authEntries.map((e) => e.espnId);
  const dbPlayers = await prisma.player.findMany({
    where: { espnId: { in: espnIds } },
    select: { espnId: true, nflTeam: true, name: true },
  });
  const dbByEspn = new Map(dbPlayers.map((p) => [p.espnId, p]));

  // Live team_mismatch / single_source only for picker-eligible pool candidates.
  // CUT conflicts that exclude a player are recorded then immediately eligible
  // for cleanup if we treat them as explained exclusions — we still upsert for
  // audit but resolve non-pool issues at the end.
  for (const entry of authEntries) {
    checkedPlayers += 1;
    // Reserve/Left Squad: Sleeper Active is untrusted — do not open practice-squad
    // / single-source banner rows. Explained exclusion stays out of the pool count.
    if (entry.reserveLeftSquad) {
      continue;
    }
    if (entry.teamMismatch) {
      teamMismatches += 1;
      const cutTeam = cutTeamFromEvidence(entry);
      const cutWeek = cutWeekFromEvidence(entry.evidence);
      const club = cutTeam ? nflTeamFullName(cutTeam) : "their club";
      const weekBit =
        cutWeek != null ? ` in Week ${cutWeek}` : "";
      await upsertIssue({
        kind: "team_mismatch",
        espnId: entry.espnId,
        playerName: entry.name,
        season,
        week: cutWeek,
        detail: `${entry.name}: team unclear (${club} cut him${weekBit}), left out of player search`,
        sources: {
          sleeperTeam: entry.sleeperTeam,
          nflverseTeam: entry.nflverseTeam,
          cutTeam,
          cutWeek,
          resolvedTeam: entry.nflTeam,
          pendingSameDay: entry.pendingSameDay,
          evidence: entry.evidence,
          pickerEligible: entry.pickerEligible,
        },
      });
    }

    if (entry.singleSourceTeam && entry.pickerEligible && entry.nflTeam !== "FA") {
      const club = nflTeamFullName(entry.nflTeam);
      const ps = entry.practiceSquad ? " practice squad" : "";
      await upsertIssue({
        kind: "single_source_team",
        espnId: entry.espnId,
        playerName: entry.name,
        season,
        detail: `${entry.name}: team not yet confirmed by a second source (listed with the ${club}${ps})`,
        sources: {
          sleeperTeam: entry.sleeperTeam,
          nflverseTeam: entry.nflverseTeam,
          resolvedTeam: entry.nflTeam,
          practiceSquad: entry.practiceSquad,
          evidence: entry.evidence,
        },
      });
    }

    const db = dbByEspn.get(entry.espnId);
    if (!db) {
      if (entry.pickerEligible && entry.nflTeam !== "FA") {
        await prisma.player.upsert({
          where: { espnId: entry.espnId },
          create: {
            espnId: entry.espnId,
            espnPlayerId: String(entry.espnId),
            name: entry.name,
            position: entry.position,
            nflTeam: entry.nflTeam,
            sleeperId: entry.sleeperId,
            gsisId: entry.gsisId,
          },
          update: {
            nflTeam: entry.nflTeam,
            sleeperId: entry.sleeperId,
            gsisId: entry.gsisId,
            updatedAt: new Date(),
          },
        });
        teamsCorrected += 1;
      }
      continue;
    }

    const shouldHaveTeam = entry.nflTeam !== "FA" && entry.pickerEligible;
    if (shouldHaveTeam && (!db.nflTeam || db.nflTeam === "FA")) {
      faConflicts += 1;
      // Correct immediately — do not leave an open roster_fa_conflict banner
      // after the fix (historical FA conflicts are closed in cleanup below).
      await prisma.player.update({
        where: { espnId: entry.espnId },
        data: {
          nflTeam: entry.nflTeam,
          ...(entry.sleeperId ? { sleeperId: entry.sleeperId } : {}),
          ...(entry.gsisId ? { gsisId: entry.gsisId } : {}),
          updatedAt: new Date(),
        },
      });
      teamsCorrected += 1;
    } else if (shouldHaveTeam) {
      await prisma.player.update({
        where: { espnId: entry.espnId },
        data: {
          nflTeam: entry.nflTeam,
          ...(entry.sleeperId ? { sleeperId: entry.sleeperId } : {}),
          ...(entry.gsisId ? { gsisId: entry.gsisId } : {}),
          updatedAt: new Date(),
        },
      });
      if (db.nflTeam !== entry.nflTeam) teamsCorrected += 1;
    } else if (entry.reserveLeftSquad && entry.nflTeam !== "FA") {
      // Keep contracted team (e.g. SF) for Reserve/Left Squad display — not FA.
      if (db.nflTeam !== entry.nflTeam) {
        await prisma.player.update({
          where: { espnId: entry.espnId },
          data: {
            nflTeam: entry.nflTeam,
            ...(entry.sleeperId ? { sleeperId: entry.sleeperId } : {}),
            ...(entry.gsisId ? { gsisId: entry.gsisId } : {}),
            updatedAt: new Date(),
          },
        });
        teamsCorrected += 1;
      }
    } else if (
      (entry.staleSleeper || entry.nflTeam === "FA" || !entry.pickerEligible) &&
      db.nflTeam &&
      db.nflTeam !== "FA"
    ) {
      await prisma.player.update({
        where: { espnId: entry.espnId },
        data: {
          nflTeam: "FA",
          updatedAt: new Date(),
        },
      });
      teamsCorrected += 1;
    }
  }

  let week = options?.week;
  if (week == null) {
    const latest = await prisma.playerWeekStat.findFirst({
      where: {
        season,
        leagueId: NFLVERSE_LEAGUE_ID,
        actualSource: "nflverse_ppr",
        actualPpr: { not: null },
      },
      orderBy: { week: "desc" },
      select: { week: true },
    });
    week = latest?.week ?? 0;
  }

  let pprMismatches = 0;
  if (week >= 1) {
    pprMismatches = await validateNflversePprWeek({ season, week });
  }

  // Keep open only: (1) pending same-day team mismatches for picker-eligible
  // players, (2) single-source teams still in the picker pool.
  // Close CUT/excluded mismatches, stale FA conflicts, and duplicates.
  const stillSingleSource = new Set(
    authEntries
      .filter((e) => e.singleSourceTeam && e.pickerEligible && e.nflTeam !== "FA")
      .map((e) => e.espnId),
  );
  const stillPendingMismatch = new Set(
    authEntries
      .filter((e) => e.teamMismatch && e.pendingSameDay && e.pickerEligible)
      .map((e) => e.espnId),
  );

  const openAll = await prisma.dataIssue.findMany({
    where: { resolved: false },
    select: { id: true, espnId: true, kind: true },
  });
  let issuesResolved = 0;
  for (const row of openAll) {
    const auth = row.espnId != null ? authByEspn.get(row.espnId) : undefined;
    let keep = false;
    if (row.kind === "single_source_team") {
      keep = row.espnId != null && stillSingleSource.has(row.espnId);
    } else if (row.kind === "team_mismatch") {
      // Explained CUT / excluded players are not banner material
      keep = row.espnId != null && stillPendingMismatch.has(row.espnId);
    } else if (row.kind === "roster_fa_conflict") {
      // Corrected or no longer applicable
      keep = false;
    } else if (row.kind === "ppr_mismatch" || row.kind === "projection_missing") {
      keep = true;
    } else {
      keep = Boolean(auth?.pickerEligible);
    }
    // Also drop issues for stale / non-eligible / Reserve-Left-Squad players
    if (
      auth &&
      (auth.staleSleeper ||
        auth.reserveLeftSquad ||
        !auth.pickerEligible) &&
      row.kind !== "ppr_mismatch"
    ) {
      keep = false;
    }
    if (!keep) {
      await prisma.dataIssue.update({
        where: { id: row.id },
        data: { resolved: true, updatedAt: new Date() },
      });
      issuesResolved += 1;
    }
  }

  return {
    teamMismatches,
    pprMismatches,
    faConflicts,
    checkedPlayers,
    teamsCorrected,
    issuesResolved,
  };
}

async function validateNflversePprWeek(options: {
  season: number;
  week: number;
}): Promise<number> {
  const crosswalk = await loadPlayerIdCrosswalk();
  const text = await fetchGunzipText(playerWeekStatsCsvGzUrl(options.season));
  const rows = parseCsv(text);
  const computedByEspn = new Map<number, { name: string; ppr: number }>();

  for (const row of rows) {
    const seasonType = (row.season_type ?? "").toUpperCase();
    if (seasonType && seasonType !== "REG") continue;
    const week = Number(row.week);
    if (week !== options.week) continue;
    const gsis = (row.player_id ?? row.gsis_id ?? "").trim();
    if (!gsis) continue;
    const espnId = crosswalk.gsisToEspn.get(gsis);
    if (espnId == null) continue;

    // Prefer nflverse fantasy_points_ppr (same path as ingest mapping).
    const ppr = fullPprFromNflverseRow(row);
    if (ppr == null) continue;
    const name =
      (row.player_display_name ?? row.player_name ?? "").trim() ||
      crosswalk.meta.get(gsis)?.name ||
      `espn-${espnId}`;
    computedByEspn.set(espnId, { name, ppr });
  }

  const stored = await prisma.playerWeekStat.findMany({
    where: {
      season: options.season,
      week: options.week,
      leagueId: NFLVERSE_LEAGUE_ID,
      actualSource: "nflverse_ppr",
      actualPpr: { not: null },
    },
    select: {
      espnId: true,
      playerName: true,
      actualPpr: true,
      source: true,
    },
  });

  let mismatches = 0;
  for (const row of stored) {
    const computed = computedByEspn.get(row.espnId);
    if (!computed || row.actualPpr == null) continue;
    const delta = Math.abs(computed.ppr - row.actualPpr);
    if (delta > 0.15) {
      mismatches += 1;
      await upsertIssue({
        kind: "ppr_mismatch",
        espnId: row.espnId,
        playerName: row.playerName,
        season: options.season,
        week: options.week,
        detail: `${row.playerName} W${options.week}: stored ${row.actualPpr.toFixed(1)} vs box-score recompute ${computed.ppr.toFixed(1)} (Δ ${delta.toFixed(1)})`,
        sources: {
          stored: row.actualPpr,
          computed: computed.ppr,
          source: row.source ?? NFLVERSE_SOURCE,
        },
      });
    }
  }
  return mismatches;
}
