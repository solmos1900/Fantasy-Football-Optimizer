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
import {
  fetchSleeperProjections,
  sleeperProjForPlayer,
} from "@/lib/sleeper/projections";
import { fetchNflWeekSnapshot } from "@/lib/players/week";
import type { PlayerPoolFreshness } from "@/lib/players/pool";
import {
  applyInjuryReport,
  fetchEspnInjuryReport,
} from "@/lib/espn/injuries";
import { fetchEspnScoreboard } from "@/lib/espn/client";
import {
  parseEspnScoreboard,
  scheduleMapWithByes,
  formatOpponentLabel,
} from "@/lib/espn/scoreboard";
import {
  buildTeammateInjuryIndex,
  serializeTeammateInjuryIndex,
  type TeammateInjuryImpact,
} from "@/lib/insights/teammate-injury";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import {
  loadLatestGoldenCheckResult,
  type GoldenCheckResult,
} from "@/lib/accuracy/golden-check";
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
  /**
   * Plain fantasy-impact line, e.g.
   * "↑ Getting 25% of team targets (up from 21%): more catches"
   */
  impactLine: string;
};

export type TrendChip = {
  /** Rising when 3wk > season by ≥15%; Fading when ≤−15%; else Steady */
  label: "Rising" | "Fading" | "Steady" | "Thin";
  avg3: number | null;
  seasonAvg: number | null;
  /** (avg3 − seasonAvg) / seasonAvg when both known */
  pctDelta: number | null;
  /**
   * Badge + reason, e.g. "Trending down: 27% below season average"
   */
  reason: string;
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
  rising: { name: string; espnId: number; nflTeam: string }[];
  fading: { name: string; espnId: number; nflTeam: string }[];
  atRisk: {
    name: string;
    espnId: number;
    nflTeam: string;
    reason: string;
  }[];
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
  /** Last Tuesday-cron golden sample result (null if never run). */
  goldenCheck: GoldenCheckResult | null;
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
    const avg3 = mean(played.slice(-3));
    const seasonAvg = mean(played);
    return {
      label: "Thin",
      avg3,
      seasonAvg,
      pctDelta: null,
      reason: "Not enough games yet to call a trend",
    };
  }
  const avg3 = mean(played.slice(-3));
  const seasonAvg = mean(played);
  if (avg3 == null || seasonAvg == null || seasonAvg === 0) {
    return {
      label: "Thin",
      avg3,
      seasonAvg,
      pctDelta: null,
      reason: "Not enough games yet to call a trend",
    };
  }
  const pctDelta = (avg3 - seasonAvg) / Math.abs(seasonAvg);
  const pctAbs = Math.round(Math.abs(pctDelta) * 100);
  let label: TrendChip["label"] = "Steady";
  let reason = `Holding steady: near season average (${avg3.toFixed(1)} last 3 vs ${seasonAvg.toFixed(1)} season)`;
  if (pctDelta >= 0.15) {
    label = "Rising";
    reason = `Trending up: ${pctAbs}% above season average`;
  } else if (pctDelta <= -0.15) {
    label = "Fading";
    reason = `Trending down: ${pctAbs}% below season average`;
  }
  return { label, avg3, seasonAvg, pctDelta, reason };
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

  const impactFor = (
    key: UsageMetricKey,
    last3: number | null,
    season: number | null,
    asPct: boolean,
  ): string => {
    if (last3 == null && season == null) return "Usage unknown";
    const cur = last3 ?? season!;
    const prior = season;
    const delta =
      last3 != null && prior != null ? last3 - prior : null;
    const flatPct = delta == null || Math.abs(delta) < 0.005;
    const flatAbs = delta == null || Math.abs(delta) < 0.05;
    const up = delta != null && !flatPct && delta > 0;
    const down = delta != null && !flatPct && delta < 0;

    if (key === "targetShare") {
      const c = Math.round(cur * 100);
      if (prior == null || flatPct) {
        return `Getting ${c}% of team targets: catch chances`;
      }
      const p = Math.round(prior * 100);
      return up
        ? `↑ Getting ${c}% of team targets (up from ${p}%): more catches`
        : `↓ Getting ${c}% of team targets (down from ${p}%): fewer catches`;
    }
    if (key === "snapShare") {
      const c = Math.round(cur * 100);
      if (prior == null || flatPct) {
        return `On field ${c}% of plays: snap share`;
      }
      const p = Math.round(prior * 100);
      return up
        ? `↑ On field ${c}% of plays (up from ${p}%): more chances`
        : `↓ On field ${c}% of plays (down from ${p}%): fewer chances`;
    }
    if (key === "airYardsShare") {
      const c = Math.round(cur * 100);
      if (prior == null || flatPct) {
        return `${c}% of team air yards: deep-target share`;
      }
      const p = Math.round(prior * 100);
      return up
        ? `↑ ${c}% of team air yards (up from ${p}%): more downfield looks`
        : `↓ ${c}% of team air yards (down from ${p}%): fewer downfield looks`;
    }
    if (key === "routes") {
      const c = Math.round(cur * 100);
      return `Running routes on ${c}% of plays: route rate`;
    }
    if (key === "carriesTargets") {
      const c = cur.toFixed(1);
      if (prior == null || flatAbs) {
        return `${c} carries+targets per game: touch volume`;
      }
      const p = prior.toFixed(1);
      const touchUp = delta != null && delta > 0;
      return touchUp
        ? `↑ ${c} carries+targets/game (up from ${p}): more touches`
        : `↓ ${c} carries+targets/game (down from ${p}): fewer touches`;
    }
    if (key === "redZoneTouches") {
      if (cur === 0 && (prior == null || prior === 0)) {
        return "No red-zone touches lately: fewer score chances";
      }
      const c = asPct ? `${Math.round(cur * 100)}%` : cur.toFixed(1);
      return `${c} red-zone touches: score chances`;
    }
    return "Usage";
  };

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
      impactLine: impactFor(key, a, b, asPct),
    });
  };

  if (position === "WR" || position === "TE" || position === "RB") {
    push("targetShare", "Targets", (r) => r.targetShare, true);
  }
  push("snapShare", "Snaps", (r) => r.snapShare, true);

  if (position === "WR" || position === "TE") {
    // routePct rarely present in nflverse week file — show — when null
    push("routes", "Routes", (r) => r.routePct, true);
    push("airYardsShare", "Air yards", (r) => r.airYardsShare, true);
  }
  if (position === "RB") {
    push(
      "carriesTargets",
      "Touches",
      (r) => {
        if (r.carries == null && r.targets == null) return null;
        return (r.carries ?? 0) + (r.targets ?? 0);
      },
      false,
    );
  }
  push("redZoneTouches", "Red zone", (r) => r.redZoneTouches, false);

  return metrics;
}

function weekCellsForPlayer(options: {
  player: FantasyPlayer;
  currentWeek: number;
  sleeperProj: number | null;
  /** Latest fully finished week — played cells stop here. */
  statsThroughWeek: number;
  /** nflverse rows — opponent/BYE hints only; ESPN/nflverse PPR owns points. */
  usageRows?: UsageWeekRow[];
}): WeekPointCell[] {
  const {
    player,
    currentWeek,
    sleeperProj,
    statsThroughWeek,
    usageRows = [],
  } = options;
  const byWeek = new Map<
    number,
    { pts: number | null; opp?: string; snapShare: number | null; hasRow: boolean }
  >();

  // Seed from nflverse/ESPN PlayerWeekStat (usage rows) — single source for
  // completed-week PPR so strips stay consistent across renders.
  for (const u of usageRows) {
    if (u.week < 1 || u.week > statsThroughWeek) continue;
    const pts =
      u.actualPpr != null && Number.isFinite(u.actualPpr)
        ? Math.round(u.actualPpr * 10) / 10
        : null;
    byWeek.set(u.week, {
      pts,
      opp: u.opponent ?? undefined,
      snapShare: u.snapShare,
      hasRow: true,
    });
  }

  // Secondary fill: ESPN/Sleeper box-score PPR (player.recentWeeks) only when
  // nflverse left the week null — never replace a known nflverse total.
  for (const w of player.recentWeeks ?? []) {
    if (w.week < 1 || w.week > statsThroughWeek) continue;
    const pts =
      typeof w.points === "number" && Number.isFinite(w.points)
        ? Math.round(w.points * 10) / 10
        : null;
    const prev = byWeek.get(w.week);
    byWeek.set(w.week, {
      pts: prev?.pts != null ? prev.pts : pts,
      opp: w.opponent ?? prev?.opp,
      snapShare: prev?.snapShare ?? null,
      hasRow: prev?.hasRow ?? pts != null,
    });
  }

  const cells: WeekPointCell[] = [];
  for (let week = 1; week <= currentWeek; week++) {
    if (week > statsThroughWeek) {
      // Current / future slate: Sleeper proj or BYE
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
    // Stat row with snaps but null PPR → unknown ("—"), not DNP.
    // (e.g. Troy Franklin W4: snaps in secondary source, nflverse PPR null.)
    const playedSnaps =
      known?.hasRow &&
      known.snapShare != null &&
      Number.isFinite(known.snapShare) &&
      known.snapShare > 0;
    if (playedSnaps) {
      cells.push({ week, kind: "empty", value: null });
      continue;
    }
    // No score and no snap evidence → DNP (never fake 0)
    cells.push({ week, kind: "dnp", value: null });
  }
  return cells;
}

/** Every player chip must lead with full name + NFL team. */
function namedChipLabel(
  player: { name: string; nflTeam: string },
  rest: string,
): string {
  return `${formatPlayerLabel(player.name, player.nflTeam)}: ${rest}`;
}

function playerRuleChips(options: {
  signal: Omit<PlayerSignal, "ruleChips">;
  usageRows: UsageWeekRow[];
  throughWeek: number;
}): RuleChip[] {
  const chips: RuleChip[] = [];
  const { signal, usageRows, throughWeek } = options;
  const who = signal.player;
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
      const from = Math.round(b * 100);
      const to = Math.round(a * 100);
      chips.push({
        id: "usage-up",
        label: namedChipLabel(
          who,
          `↑ getting ${to}% of team targets (up from ${from}%): more catches`,
        ),
        tone: "good",
        detail: `${formatPlayerLabel(who.name, who.nflTeam)}'s target share rose from ${from}% to ${to}% over the last two weeks — expect more catch chances and PPR points.`,
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
      const pct = Math.round(pctDelta * 100);
      chips.push({
        id: "sell-high",
        label: namedChipLabel(
          who,
          `Sell-high: scoring ${pct}% above season average without more usage; trade value may drop`,
        ),
        tone: "warn",
        detail: `${formatPlayerLabel(who.name, who.nflTeam)}: last 3 games avg ${avg3.toFixed(1)} vs season ${seasonAvg.toFixed(1)} (+${pct}%) while usage is flat — sell before regression.`,
      });
    }
  }

  if (signal.byeThisWeek) {
    const week =
      signal.weeks[signal.weeks.length - 1]?.week ?? "—";
    chips.push({
      id: "bye",
      label: namedChipLabel(
        who,
        `On bye week ${week}: scores 0 this week`,
      ),
      tone: "info",
      detail: `${formatPlayerLabel(who.name, who.nflTeam)} is on bye in week ${week} — he scores 0 unless you have a replacement in the lineup.`,
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
      label: `Bye conflict: ${byeStarters.length} starters score 0 this week`,
      tone: "warn",
      detail: `${byeStarters.length} starters on bye (${byeStarters.map((p) => formatPlayerLabel(p.name, p.nflTeam)).join(", ")}) — replace them or take zeros.`,
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
      const noun =
        pos === "RB" ? "running back" : pos === "TE" ? "tight end" : pos;
      chips.push({
        id: `thin-${pos}`,
        label: `Thin at ${noun}: only ${healthy.length} healthy — injury risk`,
        tone: "bad",
        detail: `Only ${healthy.length} healthy ${noun}${healthy.length === 1 ? "" : "s"} on the roster — one injury leaves the slot empty.`,
      });
    }
  }

  // Surface sell-high / usage from players into roster strip.
  // Labels already include full player + team from playerRuleChips.
  const fromPlayers = signals.flatMap((s) =>
    s.ruleChips.filter((c) => c.id === "sell-high" || c.id === "usage-up"),
  );
  for (const c of fromPlayers) {
    if (chips.length >= 6) break;
    if (!chips.some((x) => x.label === c.label)) {
      chips.push({
        ...c,
        // Unique id per player so Roster Pulse toggles don't collide.
        id: `${c.id}-${c.label}`,
      });
    }
  }

  return chips;
}

function buildPulse(signals: PlayerSignal[]): RosterPulse {
  const rising = signals
    .filter((s) => s.trend.label === "Rising")
    .map((s) => ({
      name: s.player.name,
      espnId: s.player.espnId,
      nflTeam: s.player.nflTeam,
    }));
  const fading = signals
    .filter((s) => s.trend.label === "Fading")
    .map((s) => ({
      name: s.player.name,
      espnId: s.player.espnId,
      nflTeam: s.player.nflTeam,
    }));
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
      nflTeam: s.player.nflTeam,
      reason: isOutish(s.status)
        ? s.status === "IR"
          ? "on IR — may score 0"
          : s.status === "OUT"
            ? "out — may score 0"
            : s.status === "DOUBTFUL"
              ? "doubtful — start risk"
              : "unavailable — start risk"
        : s.status === "QUESTIONABLE"
          ? "questionable — confirm before kickoff"
          : "sell-high — trade value may drop",
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
  const weekSnap = await fetchNflWeekSnapshot(league.season).catch(() => null);
  // Prefer live NFL snapshot: after MNF, currentWeek advances to the upcoming
  // slate while latestCompletedWeek stays on the finished week.
  const currentWeek =
    weekSnap?.currentWeek ??
    league.scoringPeriodId ??
    league.currentWeek;
  const statsThroughWeek =
    weekSnap?.latestCompletedWeek ??
    Math.max(0, currentWeek - 1);

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

  const [usageMap, dvpMap, sleeper, injuryReport, scoreboardRaw] =
    await Promise.all([
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
      fetchEspnScoreboard(currentWeek, league.season).catch(() => null),
    ]);

  // Stamp real opponents / BYE for the projection week (never leave vs —).
  const parsedBoard = scoreboardRaw
    ? parseEspnScoreboard(
        scoreboardRaw as Parameters<typeof parseEspnScoreboard>[0],
      )
    : null;
  const schedule = parsedBoard
    ? scheduleMapWithByes(
        parsedBoard.byTeam,
        parsedBoard.eventCount,
        contextPlayers.map((p) => p.nflTeam),
      )
    : null;

  const withOpponent = (p: FantasyPlayer): FantasyPlayer => {
    if (!schedule) return p;
    const label = formatOpponentLabel(p.nflTeam, schedule);
    if (!label) return p;
    return { ...p, opponent: label };
  };

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

  const signals: PlayerSignal[] = roster.map((rawPlayer) => {
    const player = withOpponent(rawPlayer);
    const sleeperProj = sleeperProjForPlayer(sleeper, player);
    const usageRows = usageMap.get(player.espnId) ?? [];
    const weeks = weekCellsForPlayer({
      player,
      currentWeek,
      sleeperProj,
      usageRows,
      statsThroughWeek: Math.max(statsThroughWeek, 0),
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
    // Promote teammate injury chips into the rule chip row (tap = detail).
    // Prefix with this player so Roster Pulse / trade cards never lose the subject.
    for (const imp of teammateImpacts) {
      ruleChips.unshift({
        id: `tm-${imp.direction}-${imp.teammateEspnId}`,
        label: namedChipLabel(player, imp.label),
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

  const through = Math.max(statsThroughWeek, 0);
  const coverage =
    through > 0
      ? await prisma.playerWeekStat.aggregate({
          where: {
            season: league.season,
            leagueId: NFLVERSE_LEAGUE_ID,
            week: through,
            actualPpr: { not: null },
          },
          _count: true,
          _max: { updatedAt: true },
        })
      : { _count: 0, _max: { updatedAt: null } };
  const coverageUpdated = coverage._max.updatedAt?.toISOString() ?? null;
  const latestWeekMissing = through > 0 && coverage._count < 25;

  const goldenCheck = await loadLatestGoldenCheckResult(league.season).catch(
    () => null,
  );

  const freshness: PlayerPoolFreshness = {
    season: league.season,
    currentWeek,
    statsThroughWeek: through,
    statsUpdatedAt: coverageUpdated,
    projectionsUpdatedAt: sleeper.emptyFeed ? null : sleeper.fetchedAt,
    latestWeekMissing,
    warning: [
      sleeper.emptyFeed
        ? "Weekly projections unavailable — showing — where missing."
        : null,
      latestWeekMissing
        ? `Week ${through} completed-week stats are thin or missing — not treating older weeks as current.`
        : null,
      goldenCheck && !goldenCheck.ok
        ? `Accuracy check failed (${goldenCheck.failureCount}): completed-week full-PPR sample disagrees with golden fixtures.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
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
    goldenCheck,
  };
}
