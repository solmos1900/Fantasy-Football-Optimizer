/**
 * No-league NFL player pool for Trade Analyzer / Who to Start.
 *
 * DB-first (Player + PlayerWeekStat), then short-TTL ESPN public refresh for
 * current-week projections/injuries. Heavy nflverse backfill / force-rebuild
 * runs on the cron (and optional CLI) — not inside page requests (#136).
 */

import { prisma } from "@/lib/db";
import { pointsOrZero } from "@/lib/utils";
import {
  NFLVERSE_WEEK_MIN_COVERAGE,
  nflverseWeekCoverageCount,
} from "@/lib/nflverse";
import { NFLVERSE_LEAGUE_ID, NFLVERSE_SOURCE } from "@/lib/nflverse/map";
import {
  fetchEspnPublicSkillPlayers,
  overlayEspnInjuryOwnership,
} from "@/lib/players/espn-public";
import { fetchNflWeekSnapshot } from "@/lib/players/week";
import { fetchEspnScoreboard } from "@/lib/espn/client";
import {
  applyInjuryReport,
  applySleeperInjuryStatuses,
  fetchEspnInjuryReport,
} from "@/lib/espn/injuries";
import {
  isFaOrUnknownTeam,
  nflTeamForPlayerUpdate,
} from "@/lib/espn/pro-teams";
import {
  parseEspnScoreboard,
  scheduleMapWithByes,
  formatOpponentLabel,
} from "@/lib/espn/scoreboard";
import { defaultEspnSeason } from "@/lib/season";
import {
  applyRosterAuthorityToPool,
  buildAuthoritativeRosterMap,
} from "@/lib/players/roster-authority";
import {
  fetchSleeperProjections,
  sleeperProjForPlayer,
} from "@/lib/sleeper/projections";
import { loadSleeperRosterDirectory } from "@/lib/sleeper/players";
import { loadOpenDataIssueSummary } from "@/lib/accuracy/data-issues";
import type {
  FantasyPlayer,
  InjuryStatus,
  LeagueData,
  PlayerPosition,
  PlayerTrendView,
  WeeklyScore,
} from "@/lib/types";

/** Projections / injuries refresh ceiling (hard requirement ≤ 15 min). */
export const POOL_PROJECTION_TTL_MS = 12 * 60 * 1000;

export type PlayerPoolFreshness = {
  season: number;
  currentWeek: number;
  /** Latest finished NFL week we expect to have completed-week stats for. */
  statsThroughWeek: number;
  statsUpdatedAt: string | null;
  projectionsUpdatedAt: string | null;
  /**
   * True when Neon lacks solid nflverse coverage for any week in
   * 1..statsThroughWeek (not only the tip week — #136).
   */
  latestWeekMissing: boolean;
  /** Human-readable refresh / coverage problem — never silent stale-as-current. */
  warning: string | null;
  scoringLabel: string;
  /** Open cross-source data issues (Sleeper ↔ nflverse). */
  dataIssueNotices?: string[];
  dataIssueCount?: number;
};

export type PlayerPoolBundle = {
  players: FantasyPlayer[];
  trends: Record<string, PlayerTrendView>;
  freshness: PlayerPoolFreshness;
  /** Minimal league-shaped context for tools that still take LeagueData. */
  contextLeague: LeagueData;
};

function minutesAgoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins <= 0) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

export function formatPoolFreshnessLabel(freshness: PlayerPoolFreshness): string {
  const through =
    freshness.statsThroughWeek > 0
      ? `Stats through Week ${freshness.statsThroughWeek}`
      : "No completed-week stats yet";
  const updated =
    minutesAgoLabel(freshness.projectionsUpdatedAt) ??
    minutesAgoLabel(freshness.statsUpdatedAt);
  if (updated) return `${through} · updated ${updated}`;
  return through;
}

async function completedWeekCoverage(
  season: number,
  week: number,
): Promise<{ count: number; updatedAt: Date | null }> {
  if (week < 1) return { count: 0, updatedAt: null };
  // Count nflverse evidence only — ESPN espn_category pollution must not
  // look like solid coverage and skip backfill (#125 / #126).
  const [count, latest] = await Promise.all([
    nflverseWeekCoverageCount(season, week),
    prisma.playerWeekStat.findFirst({
      where: {
        season,
        week,
        leagueId: NFLVERSE_LEAGUE_ID,
        OR: [
          { actualSource: "nflverse_ppr" },
          { source: NFLVERSE_SOURCE },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  return { count, updatedAt: latest?.updatedAt ?? null };
}

/**
 * Weeks in 1..throughWeek that lack solid nflverse coverage.
 * Used for the guest-pool data notice — ingest itself is cron-only (#136).
 */
export async function findMissingNflverseWeeks(
  season: number,
  throughWeek: number,
): Promise<number[]> {
  const max = Math.floor(throughWeek);
  if (!Number.isFinite(max) || max < 1) return [];
  const missing: number[] = [];
  const counts = await Promise.all(
    Array.from({ length: max }, (_, i) =>
      nflverseWeekCoverageCount(season, i + 1),
    ),
  );
  for (let i = 0; i < counts.length; i++) {
    if ((counts[i] ?? 0) < NFLVERSE_WEEK_MIN_COVERAGE) missing.push(i + 1);
  }
  return missing;
}

async function persistPublicPool(players: FantasyPlayer[], season: number, week: number) {
  const now = new Date();
  for (const player of players) {
    // Never let ESPN public (often proTeamId=0 → FA) wipe a real team that
    // Sleeper/nflverse authority already stored on the Player row.
    const existing = isFaOrUnknownTeam(player.nflTeam)
      ? await prisma.player.findUnique({
          where: { espnId: player.espnId },
          select: { nflTeam: true },
        })
      : null;
    const nflTeam = nflTeamForPlayerUpdate(player.nflTeam, existing?.nflTeam);

    const dbPlayer = await prisma.player.upsert({
      where: { espnId: player.espnId },
      create: {
        espnId: player.espnId,
        espnPlayerId: String(player.espnId),
        name: player.name,
        position: player.position,
        nflTeam: player.nflTeam,
      },
      update: {
        name: player.name,
        position: player.position,
        nflTeam,
        updatedAt: now,
      },
    });

    // Current-week projection + injury snapshot (league-agnostic).
    // Injury note keeps prevInjuryStatus when status changes (teammate Opp ↓).
    // Persist real published 0.0 projections (OUT/IR sit); skip only when
    // ESPN has not published a projection yet (null) and player is ACTIVE.
    const hasPublishedProj =
      typeof player.projectedPoints === "number" &&
      Number.isFinite(player.projectedPoints);
    if (hasPublishedProj || player.injuryStatus !== "ACTIVE") {
      const existing = await prisma.playerWeekStat.findUnique({
        where: {
          espnId_season_week_leagueId: {
            espnId: player.espnId,
            season,
            week,
            leagueId: NFLVERSE_LEAGUE_ID,
          },
        },
        select: { gameScriptNote: true },
      });
      const { mergeInjuryNote } = await import(
        "@/lib/insights/teammate-injury"
      );
      const injuryNote = mergeInjuryNote(
        existing?.gameScriptNote,
        player.injuryStatus,
      );
      await prisma.playerWeekStat.upsert({
        where: {
          espnId_season_week_leagueId: {
            espnId: player.espnId,
            season,
            week,
            leagueId: NFLVERSE_LEAGUE_ID,
          },
        },
        create: {
          playerId: dbPlayer.id,
          espnId: player.espnId,
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          season,
          week,
          scoringFormat: "PPR",
          projectedPpr: hasPublishedProj ? player.projectedPoints : null,
          actualPpr: null,
          projectionSource: hasPublishedProj ? "espn_public" : null,
          source: "espn",
          leagueId: NFLVERSE_LEAGUE_ID,
          opponent: player.opponent ?? null,
          gameScriptNote: injuryNote,
        },
        update: {
          playerId: dbPlayer.id,
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          // Never overwrite a stored projection with null when ESPN omits it.
          ...(hasPublishedProj
            ? {
                projectedPpr: player.projectedPoints,
                projectionSource: "espn_public",
              }
            : {}),
          source: "espn",
          // Never wipe an existing nflverse/scoreboard opponent with null —
          // ESPN public refresh does not carry opponent labels.
          ...(player.opponent
            ? { opponent: player.opponent }
            : {}),
          gameScriptNote: injuryNote,
          updatedAt: now,
        },
      });
    }

    // Do NOT persist completed-week actuals from ESPN public (#125).
    // nflverse is the only source of actual fantasy points for the guest pool.
  }
}

async function loadPlayersFromDb(options: {
  season: number;
  currentWeek: number;
  statsThroughWeek: number;
}): Promise<{ players: FantasyPlayer[]; projectionsUpdatedAt: Date | null }> {
  // No take-cap: a 500-row limit dropped stars (Lamar, Trevor Lawrence) whose
  // Player rows were older, then roster inject re-added them as empty
  // placeholders → "No 2026 stats" trade block (#126).
  const players = await prisma.player.findMany({
    where: {
      position: { in: ["QB", "RB", "WR", "TE"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!players.length) {
    return { players: [], projectionsUpdatedAt: null };
  }

  const espnIds = players.map((p) => p.espnId);
  const weekStats = await prisma.playerWeekStat.findMany({
    where: {
      espnId: { in: espnIds },
      season: options.season,
      leagueId: NFLVERSE_LEAGUE_ID,
      week: { lte: Math.max(options.currentWeek, options.statsThroughWeek) },
    },
    orderBy: { updatedAt: "desc" },
  });

  let projectionsUpdatedAt: Date | null = null;
  const byEspn = new Map<number, typeof weekStats>();
  for (const row of weekStats) {
    const list = byEspn.get(row.espnId) ?? [];
    list.push(row);
    byEspn.set(row.espnId, list);
    if (
      row.week === options.currentWeek &&
      row.projectionSource === "espn_public"
    ) {
      if (!projectionsUpdatedAt || row.updatedAt > projectionsUpdatedAt) {
        projectionsUpdatedAt = row.updatedAt;
      }
    }
  }

  const injuryFromNote = (note: string | null | undefined): InjuryStatus => {
    const m = note?.match(/injuryStatus=([A-Z_/]+)/i);
    if (!m) return "ACTIVE";
    const upper = m[1]!.toUpperCase();
    if (
      upper === "QUESTIONABLE" ||
      upper === "DOUBTFUL" ||
      upper === "OUT" ||
      upper === "IR" ||
      upper === "PUP" ||
      upper === "SUSPENSION" ||
      upper === "ACTIVE"
    ) {
      return upper as InjuryStatus;
    }
    return "ACTIVE";
  };

  /** espn_category leftovers are prior-season pollution — never show as points (#136). */
  const usableActual = (r: {
    actualPpr: number | null;
    actualSource: string | null;
  }): number | null => {
    if (r.actualSource === "espn_category") return null;
    if (r.actualPpr == null || !Number.isFinite(r.actualPpr)) return null;
    return r.actualPpr;
  };

  const out: FantasyPlayer[] = [];
  for (const p of players) {
    const rows = byEspn.get(p.espnId) ?? [];
    const current = rows.find((r) => r.week === options.currentWeek);
    // One row per week — prefer nflverse full-PPR; ignore espn_category actuals.
    const byWeek = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
      if (r.week < 1 || r.week > options.statsThroughWeek) continue;
      const actual = usableActual(r);
      if (actual == null && r.projectedPpr == null) continue;
      const prev = byWeek.get(r.week);
      if (!prev) {
        byWeek.set(r.week, r);
        continue;
      }
      const prefer =
        r.actualSource === "nflverse_ppr" &&
        prev.actualSource !== "nflverse_ppr"
          ? r
          : prev.actualSource === "nflverse_ppr"
            ? prev
            : usableActual(prev) == null && actual != null
              ? r
              : prev;
      byWeek.set(r.week, prefer);
    }
    const recentWeeks: WeeklyScore[] = [...byWeek.values()]
      .map((r) => {
        const actual = usableActual(r);
        return {
          week: r.week,
          // Null when no actual yet — never invent a 0.0 duck from missing data.
          points:
            actual != null ? Math.round(actual * 10) / 10 : null,
          projectedPoints: r.projectedPpr ?? undefined,
          opponent: r.opponent ?? undefined,
          // Historical club for past-week opponent enrichment (issue #106).
          nflTeam: r.nflTeam ?? undefined,
        };
      })
      .filter((w) => w.points != null || w.projectedPoints != null)
      .sort((a, b) => b.week - a.week)
      .slice(0, 8);

    // Prefer players that have at least some signal.
    if (
      !current?.projectedPpr &&
      recentWeeks.length === 0 &&
      !current?.opponent
    ) {
      continue;
    }

    out.push({
      id: `espn-${p.espnId}`,
      espnId: p.espnId,
      name: p.name,
      position: p.position as PlayerPosition,
      // Team corrected later by roster authority (never leave rostered as FA).
      nflTeam: p.nflTeam ?? "FA",
      injuryStatus: injuryFromNote(current?.gameScriptNote),
      // ESPN projectedPpr is storage-only until Sleeper overlay; do not treat 0 as real.
      projectedPoints: 0,
      // Missing current-week actual stays null (unknown), not a fake 0.0.
      actualPoints:
        current?.actualPpr != null && Number.isFinite(current.actualPpr)
          ? current.actualPpr
          : null,
      percentOwned: 0,
      percentStarted: 0,
      opponent: current?.opponent ?? undefined,
      recentWeeks,
    });
  }

  return {
    players: out.sort(
      (a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0),
    ),
    projectionsUpdatedAt,
  };
}

/**
 * Build / refresh the no-league player pool. Safe for guests and signed-in users.
 */
export async function getNoLeaguePlayerPool(options?: {
  forceRefresh?: boolean;
}): Promise<PlayerPoolBundle> {
  const force = Boolean(options?.forceRefresh);
  let warning: string | null = null;
  const season = defaultEspnSeason();

  let weekSnap;
  try {
    weekSnap = await fetchNflWeekSnapshot(season);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warning = `Could not read the NFL scoreboard (${message}). Showing whatever is already in the database.`;
    weekSnap = {
      season,
      currentWeek: 1,
      latestCompletedWeek: 0,
      allCurrentWeekFinal: false,
      eventCount: 0,
      fetchedAt: new Date().toISOString(),
    };
  }

  const statsThroughWeek = weekSnap.latestCompletedWeek;
  // Coverage + notices only — do NOT run multi-week nflverse ingest inside the
  // page request (timed out on /trades after #134; cron owns rebuild #136).
  const coverage = await completedWeekCoverage(season, statsThroughWeek);
  const missingWeeks = await findMissingNflverseWeeks(season, statsThroughWeek);
  const latestWeekMissing = missingWeeks.length > 0;
  if (latestWeekMissing) {
    const list =
      missingWeeks.length <= 4
        ? missingWeeks.map((w) => `Week ${w}`).join(", ")
        : `Weeks ${missingWeeks[0]}–${missingWeeks[missingWeeks.length - 1]} (${missingWeeks.length} gaps)`;
    warning = [
      warning,
      `Completed-week stats missing or thin for ${list}. The scheduled nflverse sync will refill; numbers may be incomplete until then.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  let { players, projectionsUpdatedAt } = await loadPlayersFromDb({
    season,
    currentWeek: weekSnap.currentWeek,
    statsThroughWeek,
  });

  const projAgeMs = projectionsUpdatedAt
    ? Date.now() - projectionsUpdatedAt.getTime()
    : Number.POSITIVE_INFINITY;
  const needsProjectionRefresh =
    force || !projectionsUpdatedAt || projAgeMs > POOL_PROJECTION_TTL_MS;

  if (needsProjectionRefresh) {
    try {
      const fresh = await fetchEspnPublicSkillPlayers({
        season,
        scoringPeriodId: weekSnap.currentWeek,
        limit: 350,
      });
      if (fresh.length) {
        await persistPublicPool(fresh, season, weekSnap.currentWeek);
        // Injury + ownership only — never replace DB/nflverse recentWeeks (#125).
        players = overlayEspnInjuryOwnership(players, fresh).sort(
          (a, b) =>
            pointsOrZero(b.projectedPoints) - pointsOrZero(a.projectedPoints),
        );
        projectionsUpdatedAt = new Date();
      } else {
        warning = [
          warning,
          "ESPN public player refresh returned no players — projections may be stale.",
        ]
          .filter(Boolean)
          .join(" ");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warning = [
        warning,
        `Projection/injury refresh failed (${message}). Not treating stale cache as current.`,
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  // Authoritative roster: Sleeper team + active, cross-checked with nflverse.
  // Never treat an NFL-rostered player as FA; drop inactive/retired/unsigned.
  try {
    const roster = await buildAuthoritativeRosterMap();
    const applied = applyRosterAuthorityToPool(players, roster.byEspnId);
    players = applied.players;

    // Inject picker-eligible auth players missing from ESPN/DB-derived pool
    // (practice-squad / post-cut signings often absent from ESPN public top-N).
    // Also inject Reserve/Left Squad holdovers so search can show "not playing"
    // — they stay unselectable for trades / who-to-start.
    const inPool = new Set(players.map((p) => p.espnId));
    for (const auth of roster.byEspnId.values()) {
      const injectReserve =
        auth.reserveLeftSquad && auth.nflTeam !== "FA";
      if (
        (!auth.pickerEligible && !injectReserve) ||
        auth.nflTeam === "FA"
      ) {
        continue;
      }
      if (inPool.has(auth.espnId)) continue;
      const pos = auth.position as FantasyPlayer["position"];
      if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
      players.push({
        id: `espn-${auth.espnId}`,
        espnId: auth.espnId,
        name: auth.name,
        position: pos,
        nflTeam: auth.nflTeam,
        injuryStatus: "ACTIVE",
        projectedPoints: 0,
        actualPoints: 0,
        percentOwned: 0,
        percentStarted: 0,
        practiceSquad: injectReserve ? false : auth.practiceSquad,
        singleSourceTeam: injectReserve ? false : auth.singleSourceTeam,
        reserveLeftSquad: injectReserve,
      });
      inPool.add(auth.espnId);
    }
    if (applied.teamCorrections > 0 || applied.excluded > 0) {
      // Persist corrected teams for every picker-eligible pool player
      // (not a capped slice — ESPN FA stubs can sit anywhere in the sort).
      const now = new Date();
      const BATCH = 100;
      for (let i = 0; i < players.length; i += BATCH) {
        const chunk = players.slice(i, i + BATCH);
        await Promise.all(
          chunk.map(async (p) => {
            const auth = roster.byEspnId.get(p.espnId);
            if (!auth?.pickerEligible || auth.nflTeam === "FA") return;
            await prisma.player.updateMany({
              where: { espnId: p.espnId },
              data: {
                nflTeam: auth.nflTeam,
                ...(auth.sleeperId ? { sleeperId: auth.sleeperId } : {}),
                ...(auth.gsisId ? { gsisId: auth.gsisId } : {}),
                updatedAt: now,
              },
            });
          }),
        );
      }
    }

    // Also correct any DB FA rows that authority says are rostered but were
    // never in the ESPN public pool list (practice-squad / low-owned).
    const faStubs = await prisma.player.findMany({
      where: {
        position: { in: ["QB", "RB", "WR", "TE"] },
        OR: [{ nflTeam: null }, { nflTeam: "FA" }, { nflTeam: "" }],
      },
      select: { espnId: true },
      take: 2000,
    });
    const nowFa = new Date();
    for (const stub of faStubs) {
      const auth = roster.byEspnId.get(stub.espnId);
      if (!auth?.pickerEligible || auth.nflTeam === "FA") continue;
      await prisma.player.update({
        where: { espnId: stub.espnId },
        data: {
          nflTeam: auth.nflTeam,
          ...(auth.sleeperId ? { sleeperId: auth.sleeperId } : {}),
          ...(auth.gsisId ? { gsisId: auth.gsisId } : {}),
          updatedAt: nowFa,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warning = [
      warning,
      `Roster authority refresh failed (${message}). Filtering known FA/empty-team rows only.`,
    ]
      .filter(Boolean)
      .join(" ");
    players = players.filter((p) => {
      const t = (p.nflTeam ?? "").trim().toUpperCase();
      return t !== "" && t !== "FA";
    });
  }

  // Injury status = more serious of ESPN injury report + Sleeper (#128 / #137).
  // Match Sleeper by espnId, then normalized name+team (many null espn_ids).
  try {
    const [injuryReport, sleeperDir] = await Promise.all([
      fetchEspnInjuryReport(),
      loadSleeperRosterDirectory(),
    ]);
    players = applyInjuryReport(players, injuryReport);
    players = applySleeperInjuryStatuses(players, {
      byEspnId: sleeperDir.byEspnId,
      byNameTeam: sleeperDir.byNameTeam,
      allSkill: sleeperDir.allSkill,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warning = [
      warning,
      `Injury status refresh failed (${message}). Card statuses may be incomplete.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  // Sleeper full-PPR projections only — never fall back to ESPN 0 for display math.
  try {
    const sleeper = await fetchSleeperProjections({
      season,
      week: weekSnap.currentWeek,
    });
    let sleeperHits = 0;
    players = players.map((p) => {
      const proj = sleeperProjForPlayer(sleeper, p);
      if (proj != null && Number.isFinite(proj)) {
        sleeperHits += 1;
        return { ...p, projectedPoints: proj };
      }
      // Missing Sleeper pts_ppr → null (UI shows —). Never coerce to 0 or use ESPN.
      return { ...p, projectedPoints: null };
    });
    players = players.sort((a, b) => pointsOrZero(b.projectedPoints) - pointsOrZero(a.projectedPoints));
    if (!sleeper.emptyFeed && sleeperHits > 0) {
      projectionsUpdatedAt = new Date(sleeper.fetchedAt);
    } else {
      warning = [
        warning,
        "Weekly projections unavailable — showing — where missing.",
      ]
        .filter(Boolean)
        .join(" ");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warning = [
      warning,
      `Weekly projections failed to load (${message}). Showing — where missing.`,
    ]
      .filter(Boolean)
      .join(" ");
    players = players.map((p) => ({ ...p, projectedPoints: null }));
  }

  // Stamp real opponents / BYE for the upcoming (current) week.
  try {
    const board = await fetchEspnScoreboard(weekSnap.currentWeek, season);
    const parsed = parseEspnScoreboard(
      board as Parameters<typeof parseEspnScoreboard>[0],
    );
    const schedule = scheduleMapWithByes(
      parsed.byTeam,
      parsed.eventCount,
      players.map((p) => p.nflTeam),
    );
    players = players.map((p) => {
      const opponent = formatOpponentLabel(p.nflTeam, schedule);
      return opponent ? { ...p, opponent } : p;
    });
  } catch {
    // Leave opponents unset rather than inventing matchups.
  }

  let dataIssueNotices: string[] = [];
  let dataIssueCount = 0;
  try {
    const summary = await loadOpenDataIssueSummary({
      limit: 8,
      // Banner only covers players actually in this picker pool
      poolEspnIds: players.map((p) => p.espnId),
    });
    dataIssueNotices = summary.notices;
    dataIssueCount = summary.openCount;
  } catch {
    // Table may not exist until migrate — ignore.
  }

  const freshness: PlayerPoolFreshness = {
    season,
    currentWeek: weekSnap.currentWeek,
    statsThroughWeek,
    statsUpdatedAt: coverage.updatedAt?.toISOString() ?? null,
    projectionsUpdatedAt: projectionsUpdatedAt?.toISOString() ?? null,
    latestWeekMissing,
    warning,
    scoringLabel: "Full PPR",
    dataIssueNotices,
    dataIssueCount,
  };

  const contextLeague: LeagueData = {
    leagueId: "no-league",
    season,
    name: "No league connected",
    currentWeek: weekSnap.currentWeek,
    scoringPeriodId: weekSnap.currentWeek,
    isDemo: false,
    teams: [],
    matchups: [],
    freeAgents: players,
    lastSyncedAt:
      freshness.projectionsUpdatedAt ??
      freshness.statsUpdatedAt ??
      new Date().toISOString(),
  };

  return {
    players,
    trends: {},
    freshness,
    contextLeague,
  };
}
