/**
 * Cross-source pool validation → DataIssue rows + UI summaries.
 */

import { prisma } from "@/lib/db";
import { buildAuthoritativeRosterMap } from "@/lib/players/roster-authority";
import { NFLVERSE_LEAGUE_ID, NFLVERSE_SOURCE } from "@/lib/nflverse/map";
import { fullPprFromCategories } from "@/lib/players/scoring";
import { fetchGunzipText, parseCsv } from "@/lib/nflverse/csv";
import { playerWeekStatsCsvGzUrl } from "@/lib/nflverse/urls";
import { defaultEspnSeason } from "@/lib/season";
import { loadPlayerIdCrosswalk } from "@/lib/nflverse/crosswalk";

export type DataIssueKind =
  | "team_mismatch"
  | "ppr_mismatch"
  | "roster_fa_conflict"
  | "projection_missing"
  | "single_source_team";

export type DataIssueSummary = {
  openCount: number;
  /** Short notices for UI, e.g. "data check failed for Justin Jefferson (team)" */
  notices: string[];
  byKind: Record<string, number>;
};

export async function loadOpenDataIssueSummary(options?: {
  limit?: number;
}): Promise<DataIssueSummary> {
  const limit = options?.limit ?? 12;
  const open = await prisma.dataIssue.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const byKind: Record<string, number> = {};
  for (const row of open) {
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
  }
  // Prefer team / single-source notices in the UI strip
  const ranked = [...open].sort((a, b) => {
    const rank = (k: string) =>
      k === "team_mismatch" ? 0 : k === "single_source_team" ? 1 : 2;
    return rank(a.kind) - rank(b.kind);
  });
  const notices = ranked.slice(0, limit).map((row) => {
    const who =
      row.playerName?.trim() ||
      (row.espnId ? `espn ${row.espnId}` : "player");
    const kindLabel =
      row.kind === "team_mismatch"
        ? "team"
        : row.kind === "ppr_mismatch"
          ? "PPR"
          : row.kind === "roster_fa_conflict"
            ? "roster"
            : row.kind === "single_source_team"
              ? "single-source"
              : row.kind;
    const pending =
      row.kind === "team_mismatch" &&
      (row.detail ?? "").toLowerCase().includes("pending")
        ? " — pending same-day roster move"
        : row.kind === "single_source_team"
          ? " — Sleeper-only team"
          : "";
    return `data check failed for ${who} (${kindLabel})${pending}`;
  });
  return { openCount: open.length, notices, byKind };
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
}> {
  const season = options?.season ?? defaultEspnSeason();
  const roster = await buildAuthoritativeRosterMap({ forceRefresh: true });
  let teamMismatches = 0;
  let faConflicts = 0;
  let teamsCorrected = 0;
  let checkedPlayers = 0;

  const authEntries = [...roster.byEspnId.values()];
  const espnIds = authEntries.map((e) => e.espnId);
  const dbPlayers = await prisma.player.findMany({
    where: { espnId: { in: espnIds } },
    select: { espnId: true, nflTeam: true, name: true },
  });
  const dbByEspn = new Map(dbPlayers.map((p) => [p.espnId, p]));

  for (const entry of authEntries) {
    checkedPlayers += 1;
    if (entry.teamMismatch) {
      teamMismatches += 1;
      await upsertIssue({
        kind: "team_mismatch",
        espnId: entry.espnId,
        playerName: entry.name,
        season,
        detail:
          entry.evidence ??
          `${entry.name}: Sleeper team ${entry.sleeperTeam ?? "—"} vs nflverse ${entry.nflverseTeam ?? "—"}`,
        sources: {
          sleeperTeam: entry.sleeperTeam,
          nflverseTeam: entry.nflverseTeam,
          resolvedTeam: entry.nflTeam,
          pendingSameDay: entry.pendingSameDay,
          evidence: entry.evidence,
        },
      });
    }

    if (entry.singleSourceTeam && entry.pickerEligible && entry.nflTeam !== "FA") {
      await upsertIssue({
        kind: "single_source_team",
        espnId: entry.espnId,
        playerName: entry.name,
        season,
        detail:
          entry.evidence ??
          `${entry.name}: team ${entry.nflTeam} from Sleeper only (nflverse weekly not confirming)`,
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
      // Create missing Player rows for picker-eligible rostered athletes
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

    // Correct FA when authority has a real team (Sleeper and/or nflverse ACT).
    const shouldHaveTeam = entry.nflTeam !== "FA" && entry.pickerEligible;
    if (shouldHaveTeam && (!db.nflTeam || db.nflTeam === "FA")) {
      faConflicts += 1;
      await upsertIssue({
        kind: "roster_fa_conflict",
        espnId: entry.espnId,
        playerName: entry.name,
        season,
        detail: `${entry.name}: database had FA/empty team but roster sources say ${entry.nflTeam}`,
        sources: {
          dbTeam: db.nflTeam,
          authTeam: entry.nflTeam,
          sleeperTeam: entry.sleeperTeam,
          nflverseTeam: entry.nflverseTeam,
        },
      });
    }

    if (shouldHaveTeam) {
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
    } else if (
      (entry.staleSleeper || entry.nflTeam === "FA" || !entry.pickerEligible) &&
      db.nflTeam &&
      db.nflTeam !== "FA"
    ) {
      // Stale / cut / inactive — clear bogus team off the Player row
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

  const stillMismatch = new Set(
    authEntries.filter((e) => e.teamMismatch).map((e) => e.espnId),
  );
  const stillSingleSource = new Set(
    authEntries
      .filter((e) => e.singleSourceTeam && e.pickerEligible && e.nflTeam !== "FA")
      .map((e) => e.espnId),
  );
  const openTeam = await prisma.dataIssue.findMany({
    where: {
      resolved: false,
      kind: { in: ["team_mismatch", "single_source_team"] },
    },
    select: { id: true, espnId: true, kind: true },
  });
  for (const row of openTeam) {
    if (row.espnId == null) continue;
    const stillOpen =
      row.kind === "team_mismatch"
        ? stillMismatch.has(row.espnId)
        : stillSingleSource.has(row.espnId);
    if (!stillOpen) {
      await prisma.dataIssue.update({
        where: { id: row.id },
        data: { resolved: true, updatedAt: new Date() },
      });
    }
  }

  return {
    teamMismatches,
    pprMismatches,
    faConflicts,
    checkedPlayers,
    teamsCorrected,
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

    const n = (key: string) => {
      const raw = row[key];
      if (raw == null || String(raw).trim() === "") return null;
      const v = Number(raw);
      return Number.isFinite(v) ? v : null;
    };
    const ppr = fullPprFromCategories({
      passYards: n("passing_yards"),
      passTd: n("passing_tds"),
      interceptions: n("passing_interceptions"),
      rushYards: n("rushing_yards"),
      rushTd: n("rushing_tds"),
      receptions: n("receptions"),
      recYards: n("receiving_yards"),
      recTd: n("receiving_tds"),
      fumblesLost:
        (n("rushing_fumbles_lost") ?? 0) +
          (n("receiving_fumbles_lost") ?? 0) +
          (n("sack_fumbles_lost") ?? 0) || null,
    });
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
