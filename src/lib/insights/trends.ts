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
import { humanTrendSentence, normalizeTrendLabel, trendLabelCopy } from "@/lib/insights/trend-labels";
import { defenseAllowRowsFromLeague } from "@/lib/insights/defense-matchups";
import { formatStatusCode, injuryStatusPhrase } from "@/lib/utils";

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

export type WeekStatRow = {
  week: number;
  projectedPpr: number | null;
  actualPpr: number | null;
  opponent?: string;
};

/**
 * Shared week axis for every player: weeks 1..currentWeek.
 * Missing storage still yields a row (nulls) so cards don't look like different seasons.
 */
export function scaffoldWeekAxis(
  currentWeek: number,
  known: WeekStatRow[] = [],
): WeekStatRow[] {
  const end = Math.max(1, currentWeek);
  const byWeek = new Map<number, WeekStatRow>();
  for (let week = 1; week <= end; week++) {
    byWeek.set(week, {
      week,
      projectedPpr: null,
      actualPpr: null,
    });
  }
  for (const row of known) {
    if (row.week < 1 || row.week > end) continue;
    byWeek.set(row.week, {
      week: row.week,
      projectedPpr: row.projectedPpr,
      actualPpr: row.actualPpr,
      opponent: row.opponent,
    });
  }
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}

export function weekRowsForPlayer(
  player: FantasyPlayer,
  currentWeek: number,
): WeekStatRow[] {
  const known: WeekStatRow[] = [];

  for (const w of player.recentWeeks ?? []) {
    if (w.week < 1 || w.week > currentWeek) continue;
    known.push({
      week: w.week,
      projectedPpr:
        typeof w.projectedPoints === "number" ? w.projectedPoints : null,
      actualPpr: typeof w.points === "number" ? w.points : null,
      opponent: w.opponent,
    });
  }

  const rows = scaffoldWeekAxis(currentWeek, known);
  const idx = rows.findIndex((r) => r.week === currentWeek);
  const existing = idx >= 0 ? rows[idx] : undefined;

  // Always write the current week from live roster fields.
  // Injured / low-signal players often have projectedPoints === 0 — that is a real
  // sit signal and must not be dropped (previously `> 0` turned 0 into null and the
  // upsert skipped the week entirely).
  const current: WeekStatRow = {
    week: currentWeek,
    projectedPpr: Number.isFinite(player.projectedPoints)
      ? player.projectedPoints
      : (existing?.projectedPpr ?? null),
    actualPpr:
      player.actualPoints > 0
        ? player.actualPoints
        : (existing?.actualPpr ?? null),
    opponent: player.opponent ?? existing?.opponent,
  };

  if (idx >= 0) rows[idx] = current;
  else rows.push(current);

  return rows.sort((a, b) => a.week - b.week);
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
  injuryRoleScore: number | null;
  usageTrajectory: number | null;
  redZoneScore: number | null;
  sosScore: number | null;
  hotColdScore: number | null;
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
    const evidence = `${playerName} does not have enough recent games yet — lean on this week's projection.`;
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
        rank: ["injury/role", "usage/form", "RZ", "SOS", "proj delta"],
        judgments: [
          "Not enough recent games yet — lean on this week's projection.",
        ],
      }),
      injuryRoleScore: injuryStatus === "QUESTIONABLE" ? -0.5 : 0,
      usageTrajectory: null,
      redZoneScore: null,
      sosScore: null,
      hotColdScore: null,
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

  // Ranked signal strengths (research §4). Usage null until nflverse; form slope is proxy.
  const injuryRoleScore = injured
    ? -2
    : injuryStatus === "QUESTIONABLE"
      ? -0.8
      : 0;
  const usageTrajectory =
    recentSlope != null ? Math.max(-2, Math.min(2, recentSlope / 2)) : null;
  const hotColdScore =
    avgDelta != null ? Math.max(-2, Math.min(2, avgDelta / 3)) : null;
  // RZ / SOS reserved — null until usage + DefenseWeekAllow joins land in derivation
  const redZoneScore: number | null = null;
  const sosScore: number | null = null;

  // Ranked judgments: (1) injury (2) usage/form slope (3) RZ (4) SOS (5) proj delta last
  const judgments: string[] = [];
  let trendLabel: PlayerTrendLabel = "Stable";

  if (injured) {
    trendLabel = "InjuryRisk";
    judgments.push(
      formatStatusCode(injuryStatus) === "IR"
        ? "On the IR — sit or have a backup ready until cleared."
        : `On the injury report (${formatStatusCode(injuryStatus)}) — sit or have a backup ready until cleared.`,
    );
  } else if (weeksSampled < 2 && withBoth.length < 1) {
    trendLabel = "Thin";
    judgments.push(
      "Not enough recent games yet — lean on this week's projection more than the trend.",
    );
  } else if (usageTrend === "rising") {
    trendLabel = "Rising";
    judgments.push("Recent games are trending up versus prior weeks.");
  } else if (usageTrend === "falling") {
    trendLabel = "Fading";
    judgments.push("Recent games are trending down versus prior weeks.");
  } else if (
    avgDelta != null &&
    Math.abs(avgDelta) >= 3 &&
    withBoth.length >= 2 &&
    usageTrend === "steady"
  ) {
    // Hot/cold without usage direction → Boom-Bust, not Rising (research anti-pattern)
    trendLabel = "BoomBust";
    judgments.push(
      `Scoring has swung a lot lately (about ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)} vs projection on average) — boom-or-bust, not a steady climb.`,
    );
  } else {
    trendLabel = "Stable";
    judgments.push("Recent scoring looks steady versus projections.");
  }

  if (
    !injured &&
    avgDelta != null &&
    trendLabel !== "BoomBust" &&
    Math.abs(avgDelta) >= 2
  ) {
    judgments.push(
      `Also: averaging about ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(1)} versus projection lately.`,
    );
  }

  let restOfSeasonAdj = 0;
  if (injured) restOfSeasonAdj = -4;
  else {
    if (usageTrajectory != null) restOfSeasonAdj += usageTrajectory * 0.6;
    if (hotColdScore != null && usageTrajectory != null)
      restOfSeasonAdj += hotColdScore * 0.35;
    else if (hotColdScore != null) restOfSeasonAdj += hotColdScore * 0.15;
    if (trendLabel === "BoomBust") restOfSeasonAdj *= 0.5;
  }
  restOfSeasonAdj = Math.round(restOfSeasonAdj * 10) / 10;

  const evidenceSentence = injured
    ? formatStatusCode(injuryStatus) === "IR"
      ? `${playerName} is on the IR — sit or have a backup ready until that clears.`
      : `${playerName} is ${injuryStatusPhrase(injuryStatus, "listed")} — sit or have a backup ready until that clears.`
    : avgDelta != null && withBoth.length && recentFormAvg != null
      ? `${playerName} is averaging about ${recentFormAvg.toFixed(1)} points lately (${trendLabelCopy(trendLabel).toLowerCase()}).`
      : weeksSampled > 0 && recentFormAvg != null
        ? `${playerName} has about ${recentFormAvg.toFixed(1)} points per game so far — still a short sample.`
        : `${playerName} does not have enough recent games yet — lean on this week's projection.`;

  const facts = {
    weeksSampled,
    avgProjected,
    avgActual,
    avgDelta,
    recentFormAvg,
    usageTrend,
    injuryStatus,
    injuryRoleScore,
    usageTrajectory,
    redZoneScore,
    sosScore,
    hotColdScore,
    sourceNote:
      "ESPN Fantasy / demo / heuristic snapshots — not a paid ranking site",
    missingUsage:
      "target/snap/RZ shares null until nflverse (or licensed) feed is wired",
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
    rationale: evidenceSentence,
    evidenceSentence,
    factJson: JSON.stringify(facts),
    judgmentJson: JSON.stringify({
      rank: ["injury/role", "usage/form", "RZ", "SOS", "proj delta"],
      judgments,
    }),
    injuryRoleScore,
    usageTrajectory,
    redZoneScore,
    sosScore,
    hotColdScore,
  };
}

async function upsertPlayer(player: FantasyPlayer) {
  return prisma.player.upsert({
    where: { espnId: player.espnId },
    create: {
      espnId: player.espnId,
      espnPlayerId: String(player.espnId),
      name: player.name,
      position: player.position,
      nflTeam: player.nflTeam,
    },
    update: {
      espnPlayerId: String(player.espnId),
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
      // Persist the full 1..currentWeek axis — including null/null placeholders and
      // 0-projection injury weeks — so every Insights card shares the same weeks.

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
          scoringFormat: "PPR",
          projectedPpr: projected,
          actualPpr: row.actualPpr,
          projectionDelta,
          projectionSource: rowSource,
          actualSource:
            row.actualPpr != null
              ? league.isDemo
                ? "demo"
                : "espn_league"
              : null,
          source: rowSource,
          leagueId: lid,
          opponent: row.opponent ?? null,
        },
        update: {
          playerId: dbPlayer.id,
          playerName: player.name,
          position: player.position,
          nflTeam: player.nflTeam,
          scoringFormat: "PPR",
          projectedPpr: projected,
          actualPpr: row.actualPpr,
          projectionDelta,
          projectionSource: rowSource,
          actualSource:
            row.actualPpr != null
              ? league.isDemo
                ? "demo"
                : "espn_league"
              : null,
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

    const axis = scaffoldWeekAxis(
      league.scoringPeriodId,
      stored.map((s) => ({
        week: s.week,
        projectedPpr: s.projectedPpr,
        actualPpr: s.actualPpr,
        opponent: s.opponent ?? undefined,
      })),
    );

    const derived = deriveTrendFromWeeks(
      player.name,
      axis.map((s) => ({
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
        asOfWeek: league.scoringPeriodId,
        leagueId: lid,
        weeksSampled: derived.weeksSampled,
        avgProjected: derived.avgProjected,
        avgActual: derived.avgActual,
        avgDelta: derived.avgDelta,
        recentFormAvg: derived.recentFormAvg,
        trendLabel: derived.trendLabel,
        usageTrend: derived.usageTrend,
        restOfSeasonAdj: derived.restOfSeasonAdj,
        injuryRoleScore: derived.injuryRoleScore,
        usageTrajectory: derived.usageTrajectory,
        redZoneScore: derived.redZoneScore,
        sosScore: derived.sosScore,
        hotColdScore: derived.hotColdScore,
        evidenceSentence: derived.evidenceSentence,
        factJson: derived.factJson,
        judgmentJson: derived.judgmentJson,
      },
      update: {
        playerId: dbPlayer.id,
        playerName: player.name,
        position: player.position,
        asOfWeek: league.scoringPeriodId,
        weeksSampled: derived.weeksSampled,
        avgProjected: derived.avgProjected,
        avgActual: derived.avgActual,
        avgDelta: derived.avgDelta,
        recentFormAvg: derived.recentFormAvg,
        trendLabel: derived.trendLabel,
        usageTrend: derived.usageTrend,
        restOfSeasonAdj: derived.restOfSeasonAdj,
        injuryRoleScore: derived.injuryRoleScore,
        usageTrajectory: derived.usageTrajectory,
        redZoneScore: derived.redZoneScore,
        sosScore: derived.sosScore,
        hotColdScore: derived.hotColdScore,
        evidenceSentence: derived.evidenceSentence,
        factJson: derived.factJson,
        judgmentJson: derived.judgmentJson,
      },
    });
  }

  const trends = await prisma.playerTrendSnapshot.count({
    where: { season: league.season, leagueId: lid },
  });

  // Persist only real completed-week comps from this league (espn or demo).
  // Delete any legacy fabricated source:"seed" rows so UI never reads them.
  try {
    await prisma.defenseWeekAllow.deleteMany({ where: { source: "seed" } });
    for (const row of defenseAllowRowsFromLeague(league)) {
      await prisma.defenseWeekAllow.upsert({
        where: {
          defenseAbbrev_season_week_position_role: {
            defenseAbbrev: row.defenseAbbrev,
            season: row.season,
            week: row.week,
            position: row.position,
            role: row.role,
          },
        },
        create: row,
        update: {
          pointsAllowed: row.pointsAllowed,
          pointsAllowedPpr: row.pointsAllowedPpr,
          samplePlayer: row.samplePlayer,
          nflTeam: row.nflTeam,
          vsPosition: row.vsPosition,
          source: row.source,
        },
      });
    }
  } catch (err) {
    console.error("[trends] DefenseWeekAllow sync failed", err);
  }

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
  const draft: PlayerTrendView = {
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
    rationale: "",
    evidenceSentence: undefined,
    facts,
    // Never expose internal judgment strings to the UI
    judgments: undefined,
    weeks,
  };
  // Always rebuild display copy — never surface stale DB evidenceSentence jargon
  const sentence = humanTrendSentence(draft);
  draft.rationale = sentence;
  draft.evidenceSentence = sentence;
  return draft;
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
    const known = (weeksByEspn.get(m.espnId) ?? []).map((s) => ({
      week: s.week,
      projectedPpr: s.projectedPpr,
      actualPpr: s.actualPpr,
      opponent: s.opponent ?? undefined,
    }));
    const weeks = scaffoldWeekAxis(league.scoringPeriodId, known).map((s) => ({
      week: s.week,
      projected: s.projectedPpr,
      actual: s.actualPpr,
      opponent: s.opponent ?? null,
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
