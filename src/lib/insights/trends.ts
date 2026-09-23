/**
 * Projection snapshots + trend metrics.
 *
 * Data sources (documented — do not invent FantasyPros/etc. labels in UI):
 * - ESPN Fantasy league player stats (projected appliedTotal + actual)
 * - Demo seed weekly scores (with optional projectedPoints)
 * - Heuristic fill: when a prior week has actual but no stored projection,
 *   we may set projected from a rolling recent average and mark source=heuristic
 *
 * Refresh is on-demand: league sync and /api/trends/refresh (also callable from Insights).
 */

import { prisma } from "@/lib/db";
import type {
  FantasyPlayer,
  LeagueData,
  PlayerTrendLabel,
  PlayerTrendView,
  UsageTrend,
  WeeklyScore,
} from "@/lib/types";

export type SnapshotSource = "espn" | "demo" | "heuristic";

function leagueKey(leagueId: string): string {
  return leagueId || "";
}

function allPlayers(league: LeagueData): FantasyPlayer[] {
  const byEspn = new Map<number, FantasyPlayer>();
  for (const p of [
    ...league.teams.flatMap((t) => t.roster),
    ...league.freeAgents,
  ]) {
    if (!p.espnId) continue;
    byEspn.set(p.espnId, p);
  }
  return [...byEspn.values()];
}

/**
 * Build week rows to persist for a player from current proj/actual + recentWeeks.
 */
export function weekRowsForPlayer(
  player: FantasyPlayer,
  currentWeek: number,
): {
  week: number;
  projectedPpr: number | null;
  actualPpr: number | null;
  opponent?: string;
}[] {
  const byWeek = new Map<
    number,
    { projectedPpr: number | null; actualPpr: number | null; opponent?: string }
  >();

  for (const w of player.recentWeeks ?? []) {
    byWeek.set(w.week, {
      projectedPpr:
        typeof w.projectedPoints === "number" ? w.projectedPoints : null,
      actualPpr: w.points,
      opponent: w.opponent,
    });
  }

  // Current scoring period from live roster mapping
  const existing = byWeek.get(currentWeek);
  byWeek.set(currentWeek, {
    projectedPpr:
      player.projectedPoints > 0
        ? player.projectedPoints
        : (existing?.projectedPpr ?? null),
    actualPpr:
      player.actualPoints > 0
        ? player.actualPoints
        : (existing?.actualPpr ?? null),
    opponent: player.opponent ?? existing?.opponent,
  });

  return [...byWeek.entries()]
    .map(([week, row]) => ({ week, ...row }))
    .sort((a, b) => a.week - b.week);
}

function slope(values: number[]): number | null {
  if (values.length < 2) return null;
  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

export function deriveTrendFromWeeks(
  playerName: string,
  weeks: {
    week: number;
    projectedPpr: number | null;
    actualPpr: number | null;
  }[],
): {
  weeksSampled: number;
  avgProjected: number | null;
  avgActual: number | null;
  avgDelta: number | null;
  recentFormAvg: number | null;
  trendLabel: PlayerTrendLabel;
  usageTrend: UsageTrend;
  restOfSeasonAdj: number;
  rationale: string;
} {
  const withActual = weeks.filter((w) => w.actualPpr != null);
  const withBoth = weeks.filter(
    (w) => w.actualPpr != null && w.projectedPpr != null && (w.projectedPpr ?? 0) > 0,
  );
  const weeksSampled = withActual.length;

  if (weeksSampled === 0) {
    return {
      weeksSampled: 0,
      avgProjected: null,
      avgActual: null,
      avgDelta: null,
      recentFormAvg: null,
      trendLabel: "thin",
      usageTrend: "unknown",
      restOfSeasonAdj: 0,
      rationale: `${playerName}: no stored weekly actuals yet — trend will appear after syncs accumulate.`,
    };
  }

  const avgActual =
    withActual.reduce((a, w) => a + (w.actualPpr as number), 0) /
    withActual.length;
  const avgProjected = withBoth.length
    ? withBoth.reduce((a, w) => a + (w.projectedPpr as number), 0) /
      withBoth.length
    : null;
  const avgDelta = withBoth.length
    ? withBoth.reduce(
        (a, w) => a + ((w.actualPpr as number) - (w.projectedPpr as number)),
        0,
      ) / withBoth.length
    : null;

  const recent = [...withActual]
    .sort((a, b) => b.week - a.week)
    .slice(0, 3)
    .reverse();
  const recentFormAvg =
    recent.reduce((a, w) => a + (w.actualPpr as number), 0) / recent.length;
  const recentSlope = slope(recent.map((w) => w.actualPpr as number));

  let usageTrend: UsageTrend = "unknown";
  if (recentSlope != null) {
    if (recentSlope >= 1.2) usageTrend = "rising";
    else if (recentSlope <= -1.2) usageTrend = "falling";
    else usageTrend = "steady";
  }

  let trendLabel: PlayerTrendLabel = "steady";
  if (weeksSampled < 2 && withBoth.length < 1) {
    trendLabel = "thin";
  } else if (avgDelta != null && avgDelta >= 3) {
    trendLabel = "boom";
  } else if (avgDelta != null && avgDelta <= -3) {
    trendLabel = "bust";
  } else if (usageTrend === "rising" && recentFormAvg >= avgActual + 1.5) {
    trendLabel = "hot";
  } else if (usageTrend === "falling" && recentFormAvg <= avgActual - 1.5) {
    trendLabel = "cold";
  } else if (usageTrend === "rising") {
    trendLabel = "rising";
  } else if (usageTrend === "falling") {
    trendLabel = "falling";
  }

  // Conservative ROS chip adj from delta + form (PPR points, capped)
  let restOfSeasonAdj = 0;
  if (avgDelta != null) restOfSeasonAdj += Math.max(-2.5, Math.min(2.5, avgDelta * 0.35));
  if (usageTrend === "rising") restOfSeasonAdj += 0.6;
  if (usageTrend === "falling") restOfSeasonAdj -= 0.6;
  if (trendLabel === "hot" || trendLabel === "boom") restOfSeasonAdj += 0.4;
  if (trendLabel === "cold" || trendLabel === "bust") restOfSeasonAdj -= 0.4;
  restOfSeasonAdj = Math.round(restOfSeasonAdj * 10) / 10;

  const parts: string[] = [];
  if (avgDelta != null && withBoth.length) {
    parts.push(
      `Across ${withBoth.length} week(s) with both proj + actual, avg ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)} vs ESPN/demo projection.`,
    );
  } else {
    parts.push(
      `${weeksSampled} scored week(s) stored; projection history still thin — comparing form only.`,
    );
  }
  parts.push(
    `Recent form avg ${recentFormAvg.toFixed(1)} PPR (last ${recent.length}). Trend label: ${trendLabel}.`,
  );
  if (restOfSeasonAdj !== 0) {
    parts.push(
      `Trade chip nudge ${restOfSeasonAdj >= 0 ? "+" : ""}${restOfSeasonAdj.toFixed(1)} from stored trends (not a third-party ranking).`,
    );
  }

  return {
    weeksSampled,
    avgProjected,
    avgActual,
    avgDelta,
    recentFormAvg,
    trendLabel,
    usageTrend,
    restOfSeasonAdj,
    rationale: `${playerName}: ${parts.join(" ")}`,
  };
}

/**
 * Upsert weekly snapshots + recompute trend metrics for every player in the league.
 */
export async function refreshProjectionTrends(
  league: LeagueData,
): Promise<{ snapshots: number; trends: number }> {
  const source: SnapshotSource = league.isDemo ? "demo" : "espn";
  const lid = leagueKey(league.leagueId);
  const players = allPlayers(league);
  let snapshots = 0;

  for (const player of players) {
    const rows = weekRowsForPlayer(player, league.scoringPeriodId);

    // Heuristic: fill missing projections for past weeks from player's recent actual avg
    const actuals = rows
      .filter((r) => r.actualPpr != null)
      .map((r) => r.actualPpr as number);
    const heuristicProj =
      actuals.length >= 2
        ? actuals.reduce((a, b) => a + b, 0) / actuals.length
        : player.projectedPoints || null;

    for (const row of rows) {
      let projected = row.projectedPpr;
      let rowSource: SnapshotSource = source;
      if (
        projected == null &&
        row.week < league.scoringPeriodId &&
        row.actualPpr != null &&
        heuristicProj != null
      ) {
        projected = Math.round(heuristicProj * 10) / 10;
        rowSource = "heuristic";
      }

      if (projected == null && row.actualPpr == null) continue;

      await prisma.playerProjectionSnapshot.upsert({
        where: {
          espnId_season_week_leagueId: {
            espnId: player.espnId,
            season: league.season,
            week: row.week,
            leagueId: lid,
          },
        },
        create: {
          espnId: player.espnId,
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          season: league.season,
          week: row.week,
          projectedPpr: projected,
          actualPpr: row.actualPpr,
          source: rowSource,
          leagueId: lid,
          opponent: row.opponent ?? null,
        },
        update: {
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          projectedPpr: projected,
          actualPpr: row.actualPpr,
          source: rowSource,
          opponent: row.opponent ?? null,
        },
      });
      snapshots += 1;
    }

    const stored = await prisma.playerProjectionSnapshot.findMany({
      where: {
        espnId: player.espnId,
        season: league.season,
        leagueId: lid,
      },
      orderBy: { week: "asc" },
    });

    const derived = deriveTrendFromWeeks(
      player.name,
      stored.map((s) => ({
        week: s.week,
        projectedPpr: s.projectedPpr,
        actualPpr: s.actualPpr,
      })),
    );

    await prisma.playerTrendMetric.upsert({
      where: {
        espnId_season_leagueId: {
          espnId: player.espnId,
          season: league.season,
          leagueId: lid,
        },
      },
      create: {
        espnId: player.espnId,
        playerName: player.name,
        position: player.position,
        season: league.season,
        leagueId: lid,
        ...derived,
      },
      update: {
        playerName: player.name,
        position: player.position,
        ...derived,
      },
    });
  }

  const trends = await prisma.playerTrendMetric.count({
    where: { season: league.season, leagueId: lid },
  });

  return { snapshots, trends };
}

export async function loadTrendMap(
  league: LeagueData,
): Promise<Map<number, PlayerTrendView>> {
  const lid = leagueKey(league.leagueId);
  const metrics = await prisma.playerTrendMetric.findMany({
    where: { season: league.season, leagueId: lid },
  });
  const snaps = await prisma.playerProjectionSnapshot.findMany({
    where: { season: league.season, leagueId: lid },
    orderBy: { week: "asc" },
  });

  const weeksByEspn = new Map<number, typeof snaps>();
  for (const s of snaps) {
    const list = weeksByEspn.get(s.espnId) ?? [];
    list.push(s);
    weeksByEspn.set(s.espnId, list);
  }

  const map = new Map<number, PlayerTrendView>();
  for (const m of metrics) {
    const weeks = (weeksByEspn.get(m.espnId) ?? []).map((s) => ({
      week: s.week,
      projected: s.projectedPpr,
      actual: s.actualPpr,
      opponent: s.opponent,
    }));
    map.set(m.espnId, {
      espnId: m.espnId,
      playerName: m.playerName,
      position: m.position,
      trendLabel: m.trendLabel as PlayerTrendLabel,
      usageTrend: m.usageTrend as UsageTrend,
      weeksSampled: m.weeksSampled,
      avgProjected: m.avgProjected,
      avgActual: m.avgActual,
      avgDelta: m.avgDelta,
      recentFormAvg: m.recentFormAvg,
      restOfSeasonAdj: m.restOfSeasonAdj,
      rationale: m.rationale ?? `${m.playerName}: trend sample thin.`,
      weeks,
    });
  }
  return map;
}

/** In-memory trends from league payload only (no DB) — used as fallback. */
export function computeTrendsFromLeague(
  league: LeagueData,
): Map<number, PlayerTrendView> {
  const map = new Map<number, PlayerTrendView>();
  for (const player of allPlayers(league)) {
    const rows = weekRowsForPlayer(player, league.scoringPeriodId);
    const derived = deriveTrendFromWeeks(
      player.name,
      rows.map((r) => ({
        week: r.week,
        projectedPpr: r.projectedPpr,
        actualPpr: r.actualPpr,
      })),
    );
    map.set(player.espnId, {
      espnId: player.espnId,
      playerName: player.name,
      position: player.position,
      ...derived,
      weeks: rows.map((r) => ({
        week: r.week,
        projected: r.projectedPpr,
        actual: r.actualPpr,
        opponent: r.opponent,
      })),
    });
  }
  return map;
}

export function enrichPlayersWithSnapshots(
  league: LeagueData,
  trendMap: Map<number, PlayerTrendView>,
): LeagueData {
  const enrich = (p: FantasyPlayer): FantasyPlayer => {
    const view = trendMap.get(p.espnId);
    if (!view?.weeks.length) return p;
    const byWeek = new Map(view.weeks.map((w) => [w.week, w]));
    const recentWeeks: WeeklyScore[] = (p.recentWeeks ?? []).map((w) => {
      const snap = byWeek.get(w.week);
      return {
        ...w,
        projectedPoints:
          w.projectedPoints ??
          (snap?.projected != null ? snap.projected : undefined),
      };
    });
    // Ensure weeks from DB that aren't on the player yet still show in UI via recentWeeks
    for (const w of view.weeks) {
      if (w.week >= league.scoringPeriodId) continue;
      if (recentWeeks.some((r) => r.week === w.week)) continue;
      if (w.actual == null) continue;
      recentWeeks.push({
        week: w.week,
        points: w.actual,
        projectedPoints: w.projected ?? undefined,
        opponent: w.opponent ?? undefined,
      });
    }
    recentWeeks.sort((a, b) => b.week - a.week);
    return { ...p, recentWeeks: recentWeeks.slice(0, 6) };
  };

  return {
    ...league,
    teams: league.teams.map((t) => ({
      ...t,
      roster: t.roster.map(enrich),
    })),
    freeAgents: league.freeAgents.map(enrich),
  };
}
