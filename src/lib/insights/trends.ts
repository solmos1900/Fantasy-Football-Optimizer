/**
 * Projection snapshots + trend metrics (research-aligned).
 *
 * Preferred models: Player, PlayerWeekStat, PlayerTrendSnapshot, DefenseWeekAllow.
 *
 * Sources (honest — never invent FantasyPros/etc.):
 * - ESPN Fantasy league scoring (primary proj/actual on user sync)
 * - Demo seed weekly scores
 * - Heuristic fill when actual exists but prior proj was never stored
 * - nflverse usage: optional future free feed (fields reserved; not scraped paid APIs)
 *
 * Trend judgment rank (never invert):
 * 1) injury/role  2) usage/form trajectory  3) RZ (when present)
 * 4) SOS/matchup  5) hot/cold vs projection only with usage/form context
 *
 * Refresh: league sync + Insights/player load + POST /api/trends/refresh
 */

import { prisma } from "@/lib/db";
import type {
  FantasyPlayer,
  InjuryStatus,
  LeagueData,
  PlayerTrendLabel,
  PlayerTrendView,
  UsageTrend,
  WeeklyScore,
} from "@/lib/types";
import { normalizeTrendLabel } from "@/lib/insights/trend-labels";

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
  injuryStatus: InjuryStatus = "ACTIVE",
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
  evidenceSentence: string;
  factJson: string;
  judgmentJson: string;
} {
  const withActual = weeks.filter((w) => w.actualPpr != null);
  const withBoth = weeks.filter(
    (w) =>
      w.actualPpr != null &&
      w.projectedPpr != null &&
      (w.projectedPpr ?? 0) > 0,
  );
  const weeksSampled = withActual.length;

  const injured = ["OUT", "IR", "DOUBTFUL"].includes(injuryStatus);

  if (weeksSampled === 0 && !injured) {
    const evidence = `${playerName}: no stored weekly actuals yet — trend will appear after syncs accumulate.`;
    return {
      weeksSampled: 0,
      avgProjected: null,
      avgActual: null,
      avgDelta: null,
      recentFormAvg: null,
      trendLabel: "Thin",
      usageTrend: "unknown",
      restOfSeasonAdj: 0,
      rationale: evidence,
      evidenceSentence: evidence,
      factJson: JSON.stringify({ weeksSampled: 0, injuryStatus }),
      judgmentJson: JSON.stringify({
        rank: ["injury/role", "usage/form", "proj delta"],
        judgments: ["Thin sample — wait for more syncs."],
      }),
    };
  }

  const avgActual = withActual.length
    ? withActual.reduce((a, w) => a + (w.actualPpr as number), 0) /
      withActual.length
    : null;
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
  const recentFormAvg = recent.length
    ? recent.reduce((a, w) => a + (w.actualPpr as number), 0) / recent.length
    : null;
  const recentSlope = recent.length
    ? slope(recent.map((w) => w.actualPpr as number))
    : null;

  let usageTrend: UsageTrend = "unknown";
  if (recentSlope != null) {
    if (recentSlope >= 1.2) usageTrend = "rising";
    else if (recentSlope <= -1.2) usageTrend = "falling";
    else usageTrend = "steady";
  }

  // Ranked judgments: (1) injury (2) usage/form slope (3) proj delta last
  const judgments: string[] = [];
  let trendLabel: PlayerTrendLabel = "Stable";

  if (injured) {
    trendLabel = "InjuryRisk";
    judgments.push(
      `Injury/role first: roster status ${injuryStatus} — deprioritize start/trade chip until cleared.`,
    );
  } else if (weeksSampled < 2 && withBoth.length < 1) {
    trendLabel = "Thin";
    judgments.push("Thin sample — prefer projection + role over hot/cold.");
  } else if (usageTrend === "rising") {
    trendLabel = "Rising";
    judgments.push(
      "Usage/form trajectory (recent actuals) rising vs prior weeks.",
    );
  } else if (usageTrend === "falling") {
    trendLabel = "Fading";
    judgments.push(
      "Usage/form trajectory (recent actuals) fading vs prior weeks.",
    );
  } else if (
    avgDelta != null &&
    Math.abs(avgDelta) >= 3 &&
    withBoth.length >= 2
  ) {
    trendLabel = "BoomBust";
    judgments.push(
      `Proj-vs-actual swing avg ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)} — boom/bust vs stored projections (ranked below injury/usage).`,
    );
  } else {
    trendLabel = "Stable";
    judgments.push("Stable vs recent form and stored projections.");
  }

  if (
    !injured &&
    avgDelta != null &&
    trendLabel !== "BoomBust" &&
    Math.abs(avgDelta) >= 2
  ) {
    judgments.push(
      `Secondary: avg ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)} vs stored proj (does not outrank injury/usage).`,
    );
  }

  let restOfSeasonAdj = 0;
  if (injured) restOfSeasonAdj = -4;
  else {
    if (usageTrend === "rising") restOfSeasonAdj += 0.8;
    if (usageTrend === "falling") restOfSeasonAdj -= 0.8;
    if (avgDelta != null)
      restOfSeasonAdj += Math.max(-1.5, Math.min(1.5, avgDelta * 0.25));
    if (trendLabel === "BoomBust") restOfSeasonAdj *= 0.5;
  }
  restOfSeasonAdj = Math.round(restOfSeasonAdj * 10) / 10;

  const evidenceSentence =
    injured
      ? `${playerName}: listed ${injuryStatus} — treat as Injury risk until status flips.`
      : avgDelta != null && withBoth.length
        ? `${playerName}: ${withBoth.length} wk proj+actual (avg ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)}), recent form ${recentFormAvg?.toFixed(1) ?? "—"} — ${trendLabel}.`
        : `${playerName}: ${weeksSampled} scored week(s); projection history thin — ${trendLabel}.`;

  const facts = {
    weeksSampled,
    avgProjected,
    avgActual,
    avgDelta,
    recentFormAvg,
    usageTrend,
    injuryStatus,
    sourceNote:
      "ESPN Fantasy / demo / heuristic snapshots — not a paid ranking site",
  };

  return {
    weeksSampled,
    avgProjected,
    avgActual,
    avgDelta,
    recentFormAvg,
    trendLabel,
    usageTrend,
    restOfSeasonAdj,
    rationale: `${evidenceSentence} Chip nudge ${restOfSeasonAdj >= 0 ? "+" : ""}${restOfSeasonAdj.toFixed(1)}.`,
    evidenceSentence,
    factJson: JSON.stringify(facts),
    judgmentJson: JSON.stringify({
      rank: ["injury/role", "usage/form", "RZ", "SOS", "proj delta"],
      judgments,
    }),
  };
}

async function upsertPlayer(player: FantasyPlayer) {
  return prisma.player.upsert({
    where: { espnId: player.espnId },
    create: {
      espnId: player.espnId,
      name: player.name,
      position: player.position,
      nflTeam: player.nflTeam,
    },
    update: {
      name: player.name,
      position: player.position,
      nflTeam: player.nflTeam,
    },
  });
}

export async function refreshProjectionTrends(
  league: LeagueData,
): Promise<{ snapshots: number; trends: number }> {
  const source: SnapshotSource = league.isDemo ? "demo" : "espn";
  const lid = leagueKey(league.leagueId);
  const players = allPlayers(league);
  let snapshots = 0;

  for (const player of players) {
    const dbPlayer = await upsertPlayer(player);
    const rows = weekRowsForPlayer(player, league.scoringPeriodId);

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

      const projectionDelta =
        projected != null && row.actualPpr != null
          ? row.actualPpr - projected
          : null;

      await prisma.playerWeekStat.upsert({
        where: {
          espnId_season_week_leagueId: {
            espnId: player.espnId,
            season: league.season,
            week: row.week,
            leagueId: lid,
          },
        },
        create: {
          playerId: dbPlayer.id,
          espnId: player.espnId,
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          season: league.season,
          week: row.week,
          projectedPpr: projected,
          actualPpr: row.actualPpr,
          projectionDelta,
          source: rowSource,
          leagueId: lid,
          opponent: row.opponent ?? null,
        },
        update: {
          playerId: dbPlayer.id,
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          projectedPpr: projected,
          actualPpr: row.actualPpr,
          projectionDelta,
          source: rowSource,
          opponent: row.opponent ?? null,
        },
      });
      snapshots += 1;
    }

    const stored = await prisma.playerWeekStat.findMany({
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
      player.injuryStatus,
    );

    await prisma.playerTrendSnapshot.upsert({
      where: {
        espnId_season_leagueId: {
          espnId: player.espnId,
          season: league.season,
          leagueId: lid,
        },
      },
      create: {
        playerId: dbPlayer.id,
        espnId: player.espnId,
        playerName: player.name,
        position: player.position,
        season: league.season,
        leagueId: lid,
        weeksSampled: derived.weeksSampled,
        avgProjected: derived.avgProjected,
        avgActual: derived.avgActual,
        avgDelta: derived.avgDelta,
        recentFormAvg: derived.recentFormAvg,
        trendLabel: derived.trendLabel,
        usageTrend: derived.usageTrend,
        restOfSeasonAdj: derived.restOfSeasonAdj,
        evidenceSentence: derived.evidenceSentence,
        factJson: derived.factJson,
        judgmentJson: derived.judgmentJson,
      },
      update: {
        playerId: dbPlayer.id,
        playerName: player.name,
        position: player.position,
        weeksSampled: derived.weeksSampled,
        avgProjected: derived.avgProjected,
        avgActual: derived.avgActual,
        avgDelta: derived.avgDelta,
        recentFormAvg: derived.recentFormAvg,
        trendLabel: derived.trendLabel,
        usageTrend: derived.usageTrend,
        restOfSeasonAdj: derived.restOfSeasonAdj,
        evidenceSentence: derived.evidenceSentence,
        factJson: derived.factJson,
        judgmentJson: derived.judgmentJson,
      },
    });
  }

  const trends = await prisma.playerTrendSnapshot.count({
    where: { season: league.season, leagueId: lid },
  });

  return { snapshots, trends };
}

function toTrendView(
  m: {
    espnId: number;
    playerName: string;
    position: string;
    trendLabel: string;
    usageTrend: string;
    weeksSampled: number;
    avgProjected: number | null;
    avgActual: number | null;
    avgDelta: number | null;
    recentFormAvg: number | null;
    restOfSeasonAdj: number;
    evidenceSentence: string | null;
    factJson: string | null;
    judgmentJson: string | null;
  },
  weeks: PlayerTrendView["weeks"],
): PlayerTrendView {
  let facts: Record<string, unknown> | undefined;
  let judgments: string[] | undefined;
  try {
    if (m.factJson) facts = JSON.parse(m.factJson) as Record<string, unknown>;
  } catch {
    facts = undefined;
  }
  try {
    if (m.judgmentJson) {
      const j = JSON.parse(m.judgmentJson) as { judgments?: string[] };
      judgments = j.judgments;
    }
  } catch {
    judgments = undefined;
  }

  const label = normalizeTrendLabel(m.trendLabel);
  const rationale =
    m.evidenceSentence ??
    `${m.playerName}: ${label} (${m.weeksSampled} wk sample).`;

  return {
    espnId: m.espnId,
    playerName: m.playerName,
    position: m.position,
    trendLabel: label,
    usageTrend: m.usageTrend as UsageTrend,
    weeksSampled: m.weeksSampled,
    avgProjected: m.avgProjected,
    avgActual: m.avgActual,
    avgDelta: m.avgDelta,
    recentFormAvg: m.recentFormAvg,
    restOfSeasonAdj: m.restOfSeasonAdj,
    rationale,
    evidenceSentence: m.evidenceSentence ?? undefined,
    facts,
    judgments,
    weeks,
  };
}

export async function loadTrendMap(
  league: LeagueData,
): Promise<Map<number, PlayerTrendView>> {
  const lid = leagueKey(league.leagueId);
  const metrics = await prisma.playerTrendSnapshot.findMany({
    where: { season: league.season, leagueId: lid },
  });
  const snaps = await prisma.playerWeekStat.findMany({
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
    map.set(m.espnId, toTrendView(m, weeks));
  }
  return map;
}

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
      player.injuryStatus,
    );
    map.set(
      player.espnId,
      toTrendView(
        {
          espnId: player.espnId,
          playerName: player.name,
          position: player.position,
          trendLabel: derived.trendLabel,
          usageTrend: derived.usageTrend,
          weeksSampled: derived.weeksSampled,
          avgProjected: derived.avgProjected,
          avgActual: derived.avgActual,
          avgDelta: derived.avgDelta,
          recentFormAvg: derived.recentFormAvg,
          restOfSeasonAdj: derived.restOfSeasonAdj,
          evidenceSentence: derived.evidenceSentence,
          factJson: derived.factJson,
          judgmentJson: derived.judgmentJson,
        },
        rows.map((r) => ({
          week: r.week,
          projected: r.projectedPpr,
          actual: r.actualPpr,
          opponent: r.opponent,
        })),
      ),
    );
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
