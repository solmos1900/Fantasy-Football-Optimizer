/**
 * Deterministic chat tool runners — wrap shared trade / WTS / display logic.
 * Numbers always come from these functions (never the model).
 */

import { comparePlayerPackages } from "@/lib/insights/trade-analyzer";
import { whoBenefitsCopy } from "@/lib/insights/trade-benefits";
import { compareWhoToStart } from "@/lib/insights/who-to-start";
import {
  formImpactLine,
  preferredProjOrNull,
  type ToolDisplayMeta,
} from "@/lib/insights/tool-display";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import { formatPoolFreshnessLabel } from "@/lib/players/pool";
import type {
  FantasyPlayer,
  LeagueData,
  PlayerTrendView,
} from "@/lib/types";
import type { PlayerPoolFreshness } from "@/lib/players/pool";
import { injuryStatusPhrase, formatStatusCode } from "@/lib/utils";

export type ChatPlayerMetricCard = {
  espnId: number;
  label: string;
  position: string;
  injuryStatus: string;
  injuryLabel: string | null;
  /** Season points per game — null → show "—" */
  seasonPpg: number | null;
  /** Last-3-week average PPR — null → "—" */
  last3Avg: number | null;
  /** Sleeper full-PPR projection this week — null → "—" */
  sleeperProj: number | null;
  byeThisWeek: boolean;
  opponent: string | null;
  formLine: string | null;
  spark: { week: number; points: number | null }[];
};

export type ChatFreshnessBlock = {
  label: string;
  warning: string | null;
  statsThroughWeek: number;
};

function mean(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function seasonPpg(player: FantasyPlayer): number | null {
  const pts = (player.recentWeeks ?? [])
    .map((w) => w.points)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return mean(pts);
}

function last3Avg(player: FantasyPlayer): number | null {
  const weeks = [...(player.recentWeeks ?? [])]
    .filter((w) => typeof w.points === "number" && Number.isFinite(w.points))
    .sort((a, b) => b.week - a.week)
    .slice(0, 3)
    .map((w) => w.points as number);
  return mean(weeks);
}

export function buildPlayerMetricCard(
  player: FantasyPlayer,
  meta?: ToolDisplayMeta | null,
): ChatPlayerMetricCard {
  const byeThisWeek = (player.opponent ?? "").toUpperCase() === "BYE";
  const status = formatStatusCode(player.injuryStatus);
  const injuryLabel =
    status === "ACTIVE" || status === "UNKNOWN"
      ? null
      : injuryStatusPhrase(player.injuryStatus, "listed");
  const spark = [...(player.recentWeeks ?? [])]
    .sort((a, b) => a.week - b.week)
    .slice(-6)
    .map((w) => ({
      week: w.week,
      points:
        typeof w.points === "number" && Number.isFinite(w.points)
          ? Math.round(w.points * 10) / 10
          : null,
    }));

  return {
    espnId: player.espnId,
    label: formatPlayerLabel(player.name, player.nflTeam),
    position: player.position,
    injuryStatus: status,
    injuryLabel,
    seasonPpg: seasonPpg(player),
    last3Avg: last3Avg(player),
    sleeperProj: preferredProjOrNull(player, meta),
    byeThisWeek,
    opponent: player.opponent ?? null,
    formLine: formImpactLine(player),
    spark,
  };
}

export function freshnessBlock(
  freshness: PlayerPoolFreshness,
): ChatFreshnessBlock {
  return {
    label: formatPoolFreshnessLabel(freshness),
    warning: freshness.warning,
    statsThroughWeek: freshness.statsThroughWeek,
  };
}

export type TradeToolResult = {
  ok: true;
  kind: "trade";
  headline: string;
  differenceLabel: string;
  winner: "a" | "b" | "even";
  /** Relative gap vs higher side (0–1) from shared whoBenefitsCopy. */
  pctGap: number;
  tier: "even" | "slight_edge" | "lopsided";
  /** Never green on "shouldn't accept". */
  tone: "neutral" | "positive" | "caution";
  giveValue: number;
  receiveValue: number;
  valueGap: number;
  verdictLabel: string;
  sideA: ChatPlayerMetricCard[];
  sideB: ChatPlayerMetricCard[];
  freshness: ChatFreshnessBlock;
  facts: string[];
};

export type TradeToolError = {
  ok: false;
  kind: "trade";
  message: string;
};

export function runTradeCompare(options: {
  sideA: FantasyPlayer[];
  sideB: FantasyPlayer[];
  trends?: Record<string, PlayerTrendView>;
  meta?: ToolDisplayMeta | null;
  freshness: PlayerPoolFreshness;
}): TradeToolResult | TradeToolError {
  const { sideA, sideB, trends, meta, freshness } = options;
  if (!sideA.length || !sideB.length) {
    return { ok: false, kind: "trade", message: "Add at least one player on each side." };
  }
  const trendMap =
    trends && Object.keys(trends).length
      ? new Map(
          Object.entries(trends).map(([k, v]) => [Number(k), v] as const),
        )
      : undefined;
  const analysis = comparePlayerPackages(sideA, sideB, trendMap);
  if (!analysis) {
    return {
      ok: false,
      kind: "trade",
      message:
        "Not enough scoring data to grade this trade yet (missing season points or projections). Try again after stats refresh.",
    };
  }
  const benefit = whoBenefitsCopy(
    analysis.valueGap,
    "free",
    analysis.giveValue,
    analysis.receiveValue,
  );
  return {
    ok: true,
    kind: "trade",
    headline: benefit.headline,
    differenceLabel: benefit.differenceLabel,
    winner: benefit.winner,
    pctGap: benefit.pctGap,
    tier: benefit.tier,
    tone: benefit.tone,
    giveValue: analysis.giveValue,
    receiveValue: analysis.receiveValue,
    valueGap: analysis.valueGap,
    verdictLabel: analysis.verdictLabel,
    sideA: sideA.map((p) => buildPlayerMetricCard(p, meta)),
    sideB: sideB.map((p) => buildPlayerMetricCard(p, meta)),
    freshness: freshnessBlock(freshness),
    facts: analysis.facts.slice(0, 6),
  };
}

export type WhoToStartToolResult = {
  ok: true;
  kind: "who-to-start";
  headline: string;
  verdictLabel: string;
  /** Projection gap from shared WTS logic (A − B). */
  edge: number;
  players: ChatPlayerMetricCard[];
  reasons: string[];
  freshness: ChatFreshnessBlock;
};

export type WhoToStartToolError = {
  ok: false;
  kind: "who-to-start";
  message: string;
  code?: string;
};

export function runWhoToStartCompare(options: {
  league: LeagueData;
  players: FantasyPlayer[];
  trends?: Record<string, PlayerTrendView>;
  meta?: ToolDisplayMeta | null;
  freshness: PlayerPoolFreshness;
}): WhoToStartToolResult | WhoToStartToolError {
  const { league, players, trends, meta, freshness } = options;
  if (players.length < 2) {
    return {
      ok: false,
      kind: "who-to-start",
      message: "Pick at least two players to compare.",
    };
  }
  // Pairwise: first vs best of the rest (same shared compareWhoToStart).
  const [a, ...rest] = players;
  let best = rest[0]!;
  let bestResult = compareWhoToStart(league, a!, best, {
    trends,
    toolMeta: meta,
    flexMode: true,
  });
  for (const candidate of rest.slice(1)) {
    const vs = compareWhoToStart(league, a!, candidate, {
      trends,
      toolMeta: meta,
      flexMode: true,
    });
    if (!vs.ok) continue;
    if (!bestResult.ok) {
      best = candidate;
      bestResult = vs;
      continue;
    }
    // Prefer clearer start calls / larger |edge|
    if (vs.ok && Math.abs(vs.edge) > Math.abs(bestResult.edge)) {
      best = candidate;
      bestResult = vs;
    }
  }

  if (!bestResult.ok) {
    return {
      ok: false,
      kind: "who-to-start",
      message: bestResult.message,
      code: bestResult.code,
    };
  }

  const ordered = [bestResult.playerA, bestResult.playerB, ...rest.filter((p) => p.espnId !== best.espnId && p.espnId !== a!.espnId)];
  return {
    ok: true,
    kind: "who-to-start",
    headline: bestResult.headline,
    verdictLabel: bestResult.verdictLabel,
    edge: bestResult.edge,
    players: ordered.map((p) => buildPlayerMetricCard(p, meta)),
    reasons: bestResult.reasons.slice(0, 4),
    freshness: freshnessBlock(freshness),
  };
}

export type OutlookToolResult = {
  ok: true;
  kind: "outlook";
  player: ChatPlayerMetricCard;
  freshness: ChatFreshnessBlock;
  staleNotice: string | null;
};

export function runPlayerOutlook(options: {
  player: FantasyPlayer;
  meta?: ToolDisplayMeta | null;
  freshness: PlayerPoolFreshness;
}): OutlookToolResult {
  const card = buildPlayerMetricCard(options.player, options.meta);
  const stale =
    options.freshness.warning ??
    (card.seasonPpg == null && card.sleeperProj == null
      ? "Stats or projections are missing for this player — showing — instead of zeros."
      : null);
  return {
    ok: true,
    kind: "outlook",
    player: card,
    freshness: freshnessBlock(options.freshness),
    staleNotice: stale,
  };
}

export type LeagueGateResult = {
  ok: false;
  kind: "league-gate";
  message: string;
  connectHref: string;
};

export function leagueLockedResult(
  feature: string,
): LeagueGateResult {
  return {
    ok: false,
    kind: "league-gate",
    message: `Connect a league to unlock ${feature}.`,
    connectHref: "/connect#espn",
  };
}
