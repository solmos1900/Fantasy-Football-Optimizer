/**
 * No-league NFL player pool for Trade Analyzer / Who to Start.
 *
 * DB-first (Player + PlayerWeekStat), then short-TTL ESPN public refresh for
 * current-week projections/injuries, and nflverse ingest when the latest
 * completed week is missing from Neon.
 */

import { prisma } from "@/lib/db";
import { pointsOrZero } from "@/lib/utils";
import { detectLatestNflverseWeek, ingestNflverseUsage } from "@/lib/nflverse";
import { NFLVERSE_LEAGUE_ID, NFLVERSE_SOURCE } from "@/lib/nflverse/map";
import { fetchEspnPublicSkillPlayers } from "@/lib/players/espn-public";
import { fetchNflWeekSnapshot } from "@/lib/players/week";
import { fetchEspnScoreboard } from "@/lib/espn/client";
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
  /** True when Neon has no completed-week coverage for statsThroughWeek. */
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
  const [count, latest] = await Promise.all([
    prisma.playerWeekStat.count({
      where: {
        season,
        week,
        leagueId: NFLVERSE_LEAGUE_ID,
        OR: [
          { actualPpr: { not: null } },
          { source: NFLVERSE_SOURCE },
          { targets: { not: null } },
          { carries: { not: null } },
        ],
      },
    }),
    prisma.playerWeekStat.findFirst({
      where: { season, week, leagueId: NFLVERSE_LEAGUE_ID },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  return { count, updatedAt: latest?.updatedAt ?? null };
}

async function ensureCompletedWeekIngest(options: {
  season: number;
  week: number;
}): Promise<{ ok: boolean; error?: string; updatedAt?: Date }> {
  if (options.week < 1) {
    return { ok: true };
  }
  try {
    // Prefer requested week; if nflverse season file lags, detectLatest may be lower.
    const latestAvailable = await detectLatestNflverseWeek(options.season).catch(
      () => options.week,
    );
    const week = Math.min(options.week, latestAvailable);
    if (week < options.week) {
      return {
        ok: false,
        error: `Latest finished NFL week is ${options.week}, but nflverse has only published through week ${week} so far.`,
      };
    }
    const result = await ingestNflverseUsage({
      season: options.season,
      week,
      includeSnaps: true,
      mergeIntoLeagueRows: true,
    });
    if (result.weekStatsUpserted < 1 && result.mappedRows < 1) {
      return {
        ok: false,
        error: `nflverse ingest returned no rows for week ${week}.`,
      };
    }
    const coverage = await completedWeekCoverage(options.season, week);
    return { ok: coverage.count > 0, updatedAt: coverage.updatedAt ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
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

    // Persist completed-week actuals from ESPN public payload when present.
    // Gap-fill only: never overwrite actualSource=nflverse_ppr. When nflverse
    // has no row (e.g. Troy Franklin W4), ESPN category full-PPR is a real
    // second source and may be written.
    for (const rw of player.recentWeeks ?? []) {
      if (rw.week < 1 || rw.week >= week) continue;
      // Keep real 0-PPR weeks; skip only when both actual and proj are absent.
      if (
        !(typeof rw.points === "number" && Number.isFinite(rw.points)) &&
        rw.projectedPoints == null
      ) {
        continue;
      }
      const espnPts =
        typeof rw.points === "number" && Number.isFinite(rw.points)
          ? rw.points
          : null;
      const existing = await prisma.playerWeekStat.findUnique({
        where: {
          espnId_season_week_leagueId: {
            espnId: player.espnId,
            season,
            week: rw.week,
            leagueId: NFLVERSE_LEAGUE_ID,
          },
        },
        select: { actualPpr: true, actualSource: true },
      });
      const keepNflverse =
        existing?.actualSource === "nflverse_ppr" &&
        existing.actualPpr != null;
      const fillActual =
        !keepNflverse && espnPts != null && existing?.actualPpr == null;

      await prisma.playerWeekStat.upsert({
        where: {
          espnId_season_week_leagueId: {
            espnId: player.espnId,
            season,
            week: rw.week,
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
          week: rw.week,
          scoringFormat: "PPR",
          projectedPpr: rw.projectedPoints ?? null,
          actualPpr: espnPts,
          projectionSource: rw.projectedPoints != null ? "espn_public" : null,
          actualSource: espnPts != null ? "espn_category" : null,
          source: "espn",
          leagueId: NFLVERSE_LEAGUE_ID,
          opponent: rw.opponent ?? null,
        },
        update: {
          playerId: dbPlayer.id,
          ...(rw.projectedPoints != null
            ? {
                projectedPpr: rw.projectedPoints,
                projectionSource: "espn_public",
              }
            : {}),
          ...(fillActual
            ? { actualPpr: espnPts, actualSource: "espn_category" }
            : {}),
          ...(rw.opponent ? { opponent: rw.opponent } : {}),
          updatedAt: now,
        },
      });
    }
  }
}

async function loadPlayersFromDb(options: {
  season: number;
  currentWeek: number;
  statsThroughWeek: number;
}): Promise<{ players: FantasyPlayer[]; projectionsUpdatedAt: Date | null }> {
  const players = await prisma.player.findMany({
    where: {
      position: { in: ["QB", "RB", "WR", "TE"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
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
      upper === "SUSPENSION" ||
      upper === "ACTIVE"
    ) {
      return upper as InjuryStatus;
    }
    return "ACTIVE";
  };

  const out: FantasyPlayer[] = [];
  for (const p of players) {
    const rows = byEspn.get(p.espnId) ?? [];
    const current = rows.find((r) => r.week === options.currentWeek);
    // One row per week — prefer nflverse full-PPR over ESPN appliedTotal.
    const byWeek = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
      if (r.week < 1 || r.week > options.statsThroughWeek) continue;
      if (r.actualPpr == null && r.projectedPpr == null) continue;
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
            : prev.actualPpr == null && r.actualPpr != null
              ? r
              : prev;
      byWeek.set(r.week, prefer);
    }
    const recentWeeks: WeeklyScore[] = [...byWeek.values()]
      .map((r) => ({
        week: r.week,
        // Null when no actual yet — never invent a 0.0 duck from missing data.
        points:
          r.actualPpr != null && Number.isFinite(r.actualPpr)
            ? Math.round(r.actualPpr * 10) / 10
            : null,
        projectedPoints: r.projectedPpr ?? undefined,
        opponent: r.opponent ?? undefined,
      }))
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
  let coverage = await completedWeekCoverage(season, statsThroughWeek);
  let latestWeekMissing = statsThroughWeek > 0 && coverage.count < 25;

  if (latestWeekMissing || force) {
    const ingest = await ensureCompletedWeekIngest({
      season,
      week: statsThroughWeek,
    });
    if (!ingest.ok) {
      warning = [
        warning,
        ingest.error ??
          `Completed-week stats for Week ${statsThroughWeek} are missing.`,
      ]
        .filter(Boolean)
        .join(" ");
    } else {
      coverage = await completedWeekCoverage(season, statsThroughWeek);
      latestWeekMissing = statsThroughWeek > 0 && coverage.count < 25;
      if (latestWeekMissing) {
        warning = [
          warning,
          `Still missing solid Week ${statsThroughWeek} coverage after refresh.`,
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
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
        // Overlay injury + ownership from live ESPN payload.
        const byId = new Map(players.map((p) => [p.espnId, p]));
        for (const p of fresh) {
          const prev = byId.get(p.espnId);
          // Keep ESPN for injury/ownership only — projections come from Sleeper overlay.
          byId.set(p.espnId, {
            ...(prev ?? p),
            ...p,
            projectedPoints: prev?.projectedPoints ?? 0,
            recentWeeks:
              p.recentWeeks?.length ? p.recentWeeks : prev?.recentWeeks,
          });
        }
        players = [...byId.values()].sort(
          (a, b) => pointsOrZero(b.projectedPoints) - pointsOrZero(a.projectedPoints),
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
      // Missing Sleeper proj → 0 internally; UI must show "—" via toolMeta (not ESPN).
      return { ...p, projectedPoints: 0 };
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
    players = players.map((p) => ({ ...p, projectedPoints: 0 }));
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
