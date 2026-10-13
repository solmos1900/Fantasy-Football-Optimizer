/**
 * Insights roster signal engine (researcher Modules A–F).
 *
 * Sources:
 * - ESPN league: points / rosters / injury / bye (opponent label)
 * - nflverse PlayerWeekStat (leagueId=""): usage + DVP inputs
 * - Sleeper: current-week projection only (null → "—" when feed empty)
 *
 * Rule-based only. Null → omit / "—". Never fabricate comps or percentiles.
 */

import { prisma } from "@/lib/db";
import { NFLVERSE_LEAGUE_ID } from "@/lib/nflverse/map";
import {
  buildDefenseVsPositionMap,
  dvpForPlayer,
  type DvpChip,
} from "@/lib/insights/defense-vs-position";
import { fetchSleeperProjections } from "@/lib/sleeper/projections";
import { fetchNflWeekSnapshot } from "@/lib/players/week";
import type { PlayerPoolFreshness } from "@/lib/players/pool";
import {
  applyInjuryReport,
  fetchEspnInjuryReport,
} from "@/lib/espn/injuries";
import {
  buildTeammateInjuryIndex,
  serializeTeammateInjuryIndex,
  type TeammateInjuryImpact,
} from "@/lib/insights/teammate-injury";
import type {
  FantasyPlayer,
  FantasyTeam,
  InjuryStatus,
  LeagueData,
  PlayerPosition,
} from "@/lib/types";

export type WeekCellKind = "played" | "bye" | "dnp" | "proj" | "empty";

export type WeekPointCell = {
  week: number;
  kind: WeekCellKind;
  /** PPR points when kind=played; Sleeper proj when kind=proj; else null */
  value: number | null;
};

export type UsageMetricKey =
  | "targetShare"
  | "snapShare"
  | "airYardsShare"
  | "routes"
  | "carriesTargets"
  | "redZoneTouches";

export type UsageMetric = {
  key: UsageMetricKey;
  label: string;
  last3: number | null;
  season: number | null;
  /** last3 − season (same units as values) */
  delta: number | null;
  /** Display as percent? */
  asPct: boolean;
};

export type TrendChip = {
  /** Rising when 3wk > season by ≥15%; Fading when ≤−15%; else Steady */
  label: "Rising" | "Fading" | "Steady" | "Thin";
  avg3: number | null;
  seasonAvg: number | null;
  /** (avg3 − seasonAvg) / seasonAvg when both known */
  pctDelta: number | null;
};

export type RuleChip = {
  id: string;
  /** 1–3 words */
  label: string;
  tone: "good" | "warn" | "bad" | "info";
  /** Number shown on tap / detail */
  detail: string;
};

export type PlayerSignal = {
  player: FantasyPlayer;
  weeks: WeekPointCell[];
  trend: TrendChip;
  usage: UsageMetric[];
  matchup: DvpChip | null;
  status: InjuryStatus;
  byeThisWeek: boolean;
  ruleChips: RuleChip[];
  /** Teammate injury Opp ↑ / Opp ↓ chips (real ESPN status + nflverse share). */
  teammateImpacts: TeammateInjuryImpact[];
  sleeperProj: number | null;
};

export type RosterPulse = {
  rising: { name: string; espnId: number }[];
  fading: { name: string; espnId: number }[];
  atRisk: { name: string; espnId: number; reason: string }[];
};

export type WaiverWatchItem = {
  player: FantasyPlayer;
  position: PlayerPosition;
  /** 2-wk opportunity proxy: avg targets+carries last 2 completed weeks */
  opportunity: number | null;
  reason: string;
};

export type InsightsSignalsBundle = {
  currentWeek: number;
  statsThroughWeek: number;
  weekAxis: number[];
  signals: PlayerSignal[];
  pulse: RosterPulse;
  ruleChipsRoster: RuleChip[];
  waiverWatch: WaiverWatchItem[];
  freshness: PlayerPoolFreshness;
  sleeperEmpty: boolean;
  updatedAt: string;
  /** Serialized teammate-injury index for trade cards / client. */
  teammateInjury: ReturnType<typeof serializeTeammateInjuryIndex>;
};

type UsageWeekRow = {
  week: number;
  targets: number | null;
  carries: number | null;
  targetShare: number | null;
  snapShare: number | null;
  airYards: number | null;
  airYardsShare: number | null;
  redZoneTouches: number | null;
  routePct: number | null;
  actualPpr: number | null;
  opponent: string | null;
};

function mean(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function avgField(
  rows: UsageWeekRow[],
  pick: (r: UsageWeekRow) => number | null,
): number | null {
  const vals = rows
    .map(pick)
    .filter((v): v is number => v != null && Number.isFinite(v));
  return mean(vals);
}

function buildTrendChip(played: number[]): TrendChip {
  if (played.length < 2) {
    return {
      label: "Thin",
      avg3: mean(played.slice(-3)),
      seasonAvg: mean(played),
      pctDelta: null,
    };
  }
  const avg3 = mean(played.slice(-3));
  const seasonAvg = mean(played);
  if (avg3 == null || seasonAvg == null || seasonAvg === 0) {
    return { label: "Thin", avg3, seasonAvg, pctDelta: null };
  }
  const pctDelta = (avg3 - seasonAvg) / Math.abs(seasonAvg);
  let label: TrendChip["label"] = "Steady";
  if (pctDelta >= 0.15) label = "Rising";
  else if (pctDelta <= -0.15) label = "Fading";
  return { label, avg3, seasonAvg, pctDelta };
}

function isHealthy(status: InjuryStatus): boolean {
  return status === "ACTIVE" || status === "QUESTIONABLE";
}

function isOutish(status: InjuryStatus): boolean {
  return (
    status === "OUT" ||
    status === "IR" ||
    status === "DOUBTFUL" ||
    status === "SUSPENSION"
  );
}

/**
 * Load nflverse usage rows for espn ids, including team air-yards share.
 */
async function loadUsageByEspn(options: {
  season: number;
  throughWeek: number;
  espnIds: number[];
}): Promise<Map<number, UsageWeekRow[]>> {
  const out = new Map<number, UsageWeekRow[]>();
  if (!options.espnIds.length || options.throughWeek < 1) return out;

  const rows = await prisma.playerWeekStat.findMany({
    where: {
      season: options.season,
      leagueId: NFLVERSE_LEAGUE_ID,
      week: { gte: 1, lte: options.throughWeek },
      espnId: { in: options.espnIds },
    },
    orderBy: { week: "asc" },
  });

  // Team air yards by week for share calc
  const teamAir = await prisma.playerWeekStat.groupBy({
    by: ["nflTeam", "week"],
    where: {
      season: options.season,
      leagueId: NFLVERSE_LEAGUE_ID,
      week: { gte: 1, lte: options.throughWeek },
      airYards: { not: null },
      nflTeam: { not: null },
    },
    _sum: { airYards: true },
  });
  const teamAirMap = new Map<string, number>();
  for (const t of teamAir) {
    if (!t.nflTeam || t._sum.airYards == null) continue;
    teamAirMap.set(`${t.nflTeam}|${t.week}`, t._sum.airYards);
  }

  for (const row of rows) {
    const teamTotal =
      row.nflTeam != null
        ? teamAirMap.get(`${row.nflTeam}|${row.week}`)
        : undefined;
    const airYardsShare =
      row.airYards != null && teamTotal != null && teamTotal !== 0
        ? row.airYards / teamTotal
        : null;

    const list = out.get(row.espnId) ?? [];
    list.push({
      week: row.week,
      targets: row.targets,
      carries: row.carries ?? row.rushingAttempts,
      targetShare: row.targetShare,
      snapShare: row.snapShare,
      airYards: row.airYards,
      airYardsShare,
      redZoneTouches: row.redZoneTouches,
      routePct: row.routePct,
      actualPpr: row.actualPpr,
      opponent: row.opponent,
    });
    out.set(row.espnId, list);
  }
  return out;
}

function usageMetricsFor(
  position: PlayerPosition,
  rows: UsageWeekRow[],
  throughWeek: number,
): UsageMetric[] {
  const seasonRows = rows.filter((r) => r.week >= 1 && r.week <= throughWeek);
  const last3Weeks = new Set(
    [...Array.from({ length: 3 }, (_, i) => throughWeek - i)].filter(
      (w) => w >= 1,
    ),
  );
  const last3 = seasonRows.filter((r) => last3Weeks.has(r.week));

  const metrics: UsageMetric[] = [];

  const push = (
    key: UsageMetricKey,
    label: string,
    pick: (r: UsageWeekRow) => number | null,
    asPct: boolean,
  ) => {
    const a = avgField(last3, pick);
    const b = avgField(seasonRows, pick);
    metrics.push({
      key,
      label,
      last3: a,
      season: b,
      delta: a != null && b != null ? a - b : null,
      asPct,
    });
  };

  if (position === "WR" || position === "TE" || position === "RB") {
    push("targetShare", "Tgt%", (r) => r.targetShare, true);
  }
  push("snapShare", "Snap%", (r) => r.snapShare, true);

  if (position === "WR" || position === "TE") {
    // routePct rarely present in nflverse week file — show — when null
    push("routes", "Routes%", (r) => r.routePct, true);
    push("airYardsShare", "AY%", (r) => r.airYardsShare, true);
  }
  if (position === "RB") {
    push(
      "carriesTargets",
      "Car+Tgt",
      (r) => {
        if (r.carries == null && r.targets == null) return null;
        return (r.carries ?? 0) + (r.targets ?? 0);
      },
      false,
    );
  }
  push("redZoneTouches", "RZ", (r) => r.redZoneTouches, false);

  return metrics;
}

function weekCellsForPlayer(options: {
  player: FantasyPlayer;
  currentWeek: number;
  sleeperProj: number | null;
  /** nflverse rows — opponent/BYE hints only; ESPN owns PPR points. */
  usageRows?: UsageWeekRow[];
}): WeekPointCell[] {
  const { player, currentWeek, sleeperProj, usageRows = [] } = options;
  const byWeek = new Map<number, { pts: number | null; opp?: string }>();

  for (const u of usageRows) {
    if (u.week < 1 || u.week >= currentWeek) continue;
    byWeek.set(u.week, {
      pts: null,
      opp: u.opponent ?? undefined,
    });
  }

  for (const w of player.recentWeeks ?? []) {
    if (w.week < 1 || w.week >= currentWeek) continue;
    // ESPN league points are source of truth — keep real 0; null stays null.
    const pts =
      typeof w.points === "number" && Number.isFinite(w.points)
        ? w.points
        : null;
    const prev = byWeek.get(w.week);
    byWeek.set(w.week, {
      pts,
      opp: w.opponent ?? prev?.opp,
    });
  }

  const cells: WeekPointCell[] = [];
  for (let week = 1; week <= currentWeek; week++) {
    if (week === currentWeek) {
      const bye = (player.opponent ?? "").toUpperCase() === "BYE";
      if (bye) {
        cells.push({ week, kind: "bye", value: null });
      } else {
        cells.push({
          week,
          kind: "proj",
          value: sleeperProj,
        });
      }
      continue;
    }

    const known = byWeek.get(week);
    const opp = (known?.opp ?? "").toUpperCase();
    if (opp === "BYE") {
      cells.push({ week, kind: "bye", value: null });
      continue;
    }
    if (known && known.pts != null) {
      cells.push({ week, kind: "played", value: known.pts });
      continue;
    }
    // Completed week with no ESPN score → DNP / missing (never fake 0)
    cells.push({ week, kind: "dnp", value: null });
  }
  return cells;
}

function playerRuleChips(options: {
  signal: Omit<PlayerSignal, "ruleChips">;
  usageRows: UsageWeekRow[];
  throughWeek: number;
}): RuleChip[] {
  const chips: RuleChip[] = [];
  const { signal, usageRows, throughWeek } = options;
  const tgt = signal.usage.find((u) => u.key === "targetShare");

  // Usage ↑ — target share +5 pts (0.05) over last 2 weeks vs prior window
  if (tgt && throughWeek >= 2) {
    const last2 = usageRows.filter(
      (r) => r.week >= throughWeek - 1 && r.week <= throughWeek,
    );
    const prev2 = usageRows.filter(
      (r) => r.week >= throughWeek - 3 && r.week <= throughWeek - 2,
    );
    const a = avgField(last2, (r) => r.targetShare);
    const b = avgField(prev2, (r) => r.targetShare);
    if (a != null && b != null && a - b >= 0.05) {
      chips.push({
        id: "usage-up",
        label: "Usage ↑",
        tone: "good",
        detail: `Tgt% ${(b * 100).toFixed(0)}→${(a * 100).toFixed(0)} (+${((a - b) * 100).toFixed(0)} pts)`,
      });
    }
  }

  // Sell-high — 3wk avg >25% over season with flat usage (|Δ tgt%| < 3 pts)
  const { avg3, seasonAvg, pctDelta } = signal.trend;
  if (
    avg3 != null &&
    seasonAvg != null &&
    pctDelta != null &&
    pctDelta >= 0.25
  ) {
    const flat =
      tgt?.delta == null || Math.abs(tgt.delta) < 0.03 || tgt.last3 == null;
    if (flat) {
      chips.push({
        id: "sell-high",
        label: "Sell-high",
        tone: "warn",
        detail: `3wk ${avg3.toFixed(1)} vs szn ${seasonAvg.toFixed(1)} (+${(pctDelta * 100).toFixed(0)}%) · flat usage`,
      });
    }
  }

  if (signal.byeThisWeek) {
    chips.push({
      id: "bye",
      label: "On bye",
      tone: "info",
      detail: `Week ${signal.weeks[signal.weeks.length - 1]?.week ?? "—"} bye`,
    });
  }

  return chips.slice(0, 3);
}

function rosterLevelChips(
  team: FantasyTeam,
  signals: PlayerSignal[],
): RuleChip[] {
  const chips: RuleChip[] = [];
  const starters = team.roster.filter((p) => p.isStarter);

  // Bye conflict — 2+ starters currently on bye
  const byeStarters = starters.filter(
    (p) => (p.opponent ?? "").toUpperCase() === "BYE",
  );
  if (byeStarters.length >= 2) {
    chips.push({
      id: "bye-conflict",
      label: "Bye conflict",
      tone: "warn",
      detail: `${byeStarters.length} starters on bye: ${byeStarters.map((p) => p.name).join(", ")}`,
    });
  }

  for (const pos of ["TE", "RB"] as PlayerPosition[]) {
    const healthy = team.roster.filter(
      (p) =>
        p.position === pos &&
        p.slot !== "IR" &&
        isHealthy(p.injuryStatus) &&
        !isOutish(p.injuryStatus),
    );
    if (healthy.length < 2) {
      chips.push({
        id: `thin-${pos}`,
        label: `Thin at ${pos}`,
        tone: "bad",
        detail: `${healthy.length} healthy ${pos}${healthy.length === 1 ? "" : "s"}`,
      });
    }
  }

  // Surface sell-high / usage from players into roster strip (deduped labels)
  const fromPlayers = signals.flatMap((s) =>
    s.ruleChips.filter((c) => c.id === "sell-high" || c.id === "usage-up"),
  );
  for (const c of fromPlayers) {
    if (chips.length >= 6) break;
    if (!chips.some((x) => x.id === c.id && x.detail === c.detail)) {
      chips.push(c);
    }
  }

  return chips;
}

function buildPulse(signals: PlayerSignal[]): RosterPulse {
  const rising = signals
    .filter((s) => s.trend.label === "Rising")
    .map((s) => ({ name: s.player.name, espnId: s.player.espnId }));
  const fading = signals
    .filter((s) => s.trend.label === "Fading")
    .map((s) => ({ name: s.player.name, espnId: s.player.espnId }));
  const atRisk = signals
    .filter(
      (s) =>
        isOutish(s.status) ||
        s.status === "QUESTIONABLE" ||
        s.ruleChips.some((c) => c.id === "sell-high"),
    )
    .map((s) => ({
      name: s.player.name,
      espnId: s.player.espnId,
      reason: isOutish(s.status)
        ? s.status
        : s.status === "QUESTIONABLE"
          ? "Q"
          : "Sell-high",
    }));
  return { rising, fading, atRisk };
}

async function buildWaiverWatch(
  league: LeagueData,
  team: FantasyTeam,
  throughWeek: number,
): Promise<WaiverWatchItem[]> {
  // Weakest position by healthy depth
  const depths = (["RB", "WR", "TE", "QB"] as PlayerPosition[]).map((pos) => {
    const n = team.roster.filter(
      (p) => p.position === pos && p.slot !== "IR" && !isOutish(p.injuryStatus),
    ).length;
    return { pos, n };
  });
  depths.sort((a, b) => a.n - b.n);
  const weak = depths[0];
  if (!weak || weak.n >= 3) return [];

  const fas = league.freeAgents.filter((p) => p.position === weak.pos);
  if (!fas.length) return [];

  const usage = await loadUsageByEspn({
    season: league.season,
    throughWeek,
    espnIds: fas.map((p) => p.espnId),
  });

  const last2 = new Set(
    [throughWeek, throughWeek - 1].filter((w) => w >= 1),
  );

  const scored: WaiverWatchItem[] = [];
  for (const p of fas) {
    const rows = (usage.get(p.espnId) ?? []).filter((r) => last2.has(r.week));
    const opp = avgField(rows, (r) => {
      if (r.targets == null && r.carries == null) return null;
      return (r.targets ?? 0) + (r.carries ?? 0);
    });
    if (opp == null) continue;
    scored.push({
      player: p,
      position: weak.pos,
      opportunity: opp,
      reason: `2-wk opp ${opp.toFixed(1)} · thin ${weak.pos}`,
    });
  }

  return scored
    .sort((a, b) => (b.opportunity ?? 0) - (a.opportunity ?? 0))
    .slice(0, 5);
}

/**
 * Build the full Insights signals bundle for a connected league.
 */
export async function buildRosterInsightsSignals(
  league: LeagueData,
  team: FantasyTeam,
): Promise<InsightsSignalsBundle> {
  const currentWeek = league.scoringPeriodId || league.currentWeek;
  const weekSnap = await fetchNflWeekSnapshot(league.season).catch(() => null);
  const statsThroughWeek = Math.min(
    currentWeek - 1,
    weekSnap?.latestCompletedWeek ?? currentWeek - 1,
  );

  const roster = team.roster.filter((p) => p.slot !== "IR");
  const espnIds = roster.map((p) => p.espnId);

  // Full NFL skill context for teammate injury scan (injuries often off-roster).
  const contextPlayers = [
    ...league.teams.flatMap((t) => t.roster),
    ...league.freeAgents,
  ];
  const contextEspn = new Set(contextPlayers.map((p) => p.espnId));
  const dbExtra = await prisma.player.findMany({
    where: {
      position: { in: ["QB", "RB", "WR", "TE"] },
      nflTeam: {
        in: [
          ...new Set(
            roster.map((p) => p.nflTeam).filter((t) => t && t !== "FA"),
          ),
        ],
      },
    },
    take: 400,
  });
  for (const p of dbExtra) {
    if (contextEspn.has(p.espnId)) continue;
    contextPlayers.push({
      id: `espn-${p.espnId}`,
      espnId: p.espnId,
      name: p.name,
      position: p.position as PlayerPosition,
      nflTeam: p.nflTeam ?? "FA",
      injuryStatus: "ACTIVE",
      projectedPoints: 0,
      actualPoints: 0,
      percentOwned: 0,
      percentStarted: 0,
    });
    contextEspn.add(p.espnId);
  }

  const [usageMap, dvpMap, sleeper, injuryReport] = await Promise.all([
    loadUsageByEspn({
      season: league.season,
      throughWeek: Math.max(statsThroughWeek, 0),
      espnIds: [...contextEspn],
    }),
    buildDefenseVsPositionMap({
      season: league.season,
      throughWeek: Math.max(statsThroughWeek, 0),
      lookback: 4,
    }),
    fetchSleeperProjections({ season: league.season, week: currentWeek }),
    fetchEspnInjuryReport(),
  ]);

  const injuredContext = applyInjuryReport(contextPlayers, injuryReport);
  // Prefer roster's own ESPN fantasy injury when present (source of truth for owned players)
  const rosterStatus = new Map(
    roster.map((p) => [p.espnId, p.injuryStatus] as const),
  );
  const poolForInjury = injuredContext.map((p) => ({
    espnId: p.espnId,
    name: p.name,
    position: p.position,
    nflTeam: p.nflTeam,
    injuryStatus: rosterStatus.get(p.espnId) ?? p.injuryStatus,
    projectedPoints: p.projectedPoints,
  }));

  const teammateIndex = await buildTeammateInjuryIndex({
    season: league.season,
    statsThroughWeek: Math.max(statsThroughWeek, 0),
    players: poolForInjury,
  });

  const weekAxis = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const updatedAt = sleeper.fetchedAt || league.lastSyncedAt;

  const signals: PlayerSignal[] = roster.map((player) => {
    const sleeperProj = sleeper.byEspnId.get(player.espnId) ?? null;
    const usageRows = usageMap.get(player.espnId) ?? [];
    const weeks = weekCellsForPlayer({
      player,
      currentWeek,
      sleeperProj,
      usageRows,
    });
    const playedVals = weeks
      .filter((c) => c.kind === "played" && c.value != null)
      .map((c) => c.value as number);
    const trend = buildTrendChip(playedVals);
    const usage = usageMetricsFor(
      player.position,
      usageRows,
      Math.max(statsThroughWeek, 0),
    );
    const matchup = dvpForPlayer(dvpMap, player.opponent, player.position);
    const byeThisWeek = (player.opponent ?? "").toUpperCase() === "BYE";
    const teammateImpacts = teammateIndex.byEspnId.get(player.espnId) ?? [];
    const base = {
      player,
      weeks,
      trend,
      usage,
      matchup,
      status: player.injuryStatus,
      byeThisWeek,
      sleeperProj,
      teammateImpacts,
    };
    const ruleChips = playerRuleChips({
      signal: base,
      usageRows,
      throughWeek: Math.max(statsThroughWeek, 0),
    });
    // Promote teammate injury chips into the rule chip row (tap = detail)
    for (const imp of teammateImpacts) {
      ruleChips.unshift({
        id: `tm-${imp.direction}-${imp.teammateEspnId}`,
        label: imp.label,
        tone: imp.tone,
        detail: imp.detail,
      });
    }
    return { ...base, ruleChips: ruleChips.slice(0, 4) };
  });

  // Starters first, then bench — dense Sleeper-style order
  signals.sort((a, b) => {
    const as = a.player.isStarter ? 0 : 1;
    const bs = b.player.isStarter ? 0 : 1;
    if (as !== bs) return as - bs;
    return (b.sleeperProj ?? -1) - (a.sleeperProj ?? -1);
  });

  const pulse = buildPulse(signals);
  const ruleChipsRoster = rosterLevelChips(team, signals);
  const waiverWatch = await buildWaiverWatch(
    league,
    team,
    Math.max(statsThroughWeek, 0),
  );

  const coverageUpdated =
    (
      await prisma.playerWeekStat.findFirst({
        where: {
          season: league.season,
          leagueId: NFLVERSE_LEAGUE_ID,
          week: Math.max(statsThroughWeek, 0) || undefined,
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      })
    )?.updatedAt?.toISOString() ?? null;

  const freshness: PlayerPoolFreshness = {
    season: league.season,
    currentWeek,
    statsThroughWeek: Math.max(statsThroughWeek, 0),
    statsUpdatedAt: coverageUpdated,
    projectionsUpdatedAt: sleeper.emptyFeed ? null : sleeper.fetchedAt,
    latestWeekMissing: statsThroughWeek > 0 && !coverageUpdated,
    warning: sleeper.emptyFeed
      ? "Sleeper projections unavailable — Proj cells show — (not ESPN relabeled)."
      : null,
    scoringLabel: "Full PPR",
  };

  return {
    currentWeek,
    statsThroughWeek: Math.max(statsThroughWeek, 0),
    weekAxis,
    signals,
    pulse,
    ruleChipsRoster,
    waiverWatch,
    freshness,
    sleeperEmpty: sleeper.emptyFeed,
    updatedAt,
    teammateInjury: serializeTeammateInjuryIndex(teammateIndex),
  };
}
