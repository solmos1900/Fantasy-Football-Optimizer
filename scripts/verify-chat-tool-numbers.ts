/**
 * Chat answers' numbers must equal underlying tool / shared-logic outputs.
 * Run: npx tsx scripts/verify-chat-tool-numbers.ts
 */

import assert from "node:assert/strict";
import { whoBenefitsCopy } from "../src/lib/insights/trade-benefits";
import { compareWhoToStart } from "../src/lib/insights/who-to-start";
import {
  seasonPpgTradeValue,
  sideSeasonPpgTradeValue,
} from "../src/lib/insights/trade-value";
import {
  runTradeCompare,
  runWhoToStartCompare,
  buildPlayerMetricCard,
} from "../src/lib/chat/tool-runners";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";
import type { PlayerPoolFreshness } from "../src/lib/players/pool";

function player(
  partial: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "name" | "nflTeam" | "espnId">,
): FantasyPlayer {
  return {
    id: `espn-${partial.espnId}`,
    espnId: partial.espnId,
    name: partial.name,
    position: partial.position ?? "WR",
    nflTeam: partial.nflTeam,
    injuryStatus: partial.injuryStatus ?? "ACTIVE",
    projectedPoints:
      partial.projectedPoints !== undefined ? partial.projectedPoints : 14,
    actualPoints:
      partial.actualPoints !== undefined ? partial.actualPoints : null,
    percentOwned: 80,
    percentStarted: 70,
    opponent: partial.opponent ?? "SEA",
    recentWeeks: partial.recentWeeks ?? [
      { week: 1, points: 12 },
      { week: 2, points: 18 },
      { week: 3, points: 15 },
      { week: 4, points: 16 },
    ],
  };
}

const freshness: PlayerPoolFreshness = {
  season: 2026,
  currentWeek: 5,
  statsThroughWeek: 4,
  statsUpdatedAt: new Date().toISOString(),
  projectionsUpdatedAt: new Date().toISOString(),
  latestWeekMissing: false,
  warning: null,
  scoringLabel: "full PPR",
};

const a = player({
  espnId: 101,
  name: "Puka Nacua",
  nflTeam: "LAR",
  projectedPoints: 17.2,
});
const b = player({
  espnId: 102,
  name: "DK Metcalf",
  nflTeam: "PIT",
  projectedPoints: 12.4,
  recentWeeks: [
    { week: 1, points: 8 },
    { week: 2, points: 9 },
    { week: 3, points: 7 },
    { week: 4, points: 10 },
  ],
});
const c = player({
  espnId: 103,
  name: "Garrett Wilson",
  nflTeam: "NYJ",
  projectedPoints: 13.1,
});
const d = player({
  espnId: 104,
  name: "Chris Olave",
  nflTeam: "NO",
  projectedPoints: 11.5,
});

// ── Trade: chat totals = sum of season PPG (not Insights chip blend) ──
{
  const give = sideSeasonPpgTradeValue([a, c]);
  const recv = sideSeasonPpgTradeValue([b, d]);
  const chat = runTradeCompare({
    sideA: [a, c],
    sideB: [b, d],
    freshness,
  });
  assert.equal(chat.ok, true);
  if (!chat.ok) throw new Error("trade failed");
  assert.equal(chat.valueBasis, "season_ppg");
  assert.equal(chat.giveValue, give);
  assert.equal(chat.receiveValue, recv);
  assert.equal(chat.valueGap, recv - give);
  // Per-card tradeValue === season PPG and sums to package totals
  for (const card of [...chat.sideA, ...chat.sideB]) {
    assert.equal(card.tradeValue, card.seasonPpg);
  }
  const sumA = chat.sideA.reduce((s, c) => s + (c.tradeValue ?? 0), 0);
  const sumB = chat.sideB.reduce((s, c) => s + (c.tradeValue ?? 0), 0);
  assert.ok(Math.abs(sumA - chat.giveValue) < 1e-9);
  assert.ok(Math.abs(sumB - chat.receiveValue) < 1e-9);
  const benefit = whoBenefitsCopy(recv - give, "free", give, recv);
  assert.equal(chat.headline, benefit.headline);
  assert.equal(chat.differenceLabel, benefit.differenceLabel);
  assert.equal(chat.winner, benefit.winner);
  assert.equal(chat.pctGap, benefit.pctGap);
  assert.match(chat.pctGapBasisLabel, /lower side/i);
}

// ── Live W7 shape: Puka 23 + Kyren 19.8 = 42.8 vs Chase 16 + Brown 13 = 29 ──
{
  const puka = player({
    espnId: 4426515,
    name: "Puka Nacua",
    nflTeam: "LAR",
    recentWeeks: [
      { week: 1, points: 12.4 },
      { week: 4, points: 27.7 },
      { week: 5, points: 37.7 },
      { week: 6, points: 14 },
    ],
  });
  const kyren = player({
    espnId: 4430737,
    name: "Kyren Williams",
    nflTeam: "LAR",
    position: "RB",
    recentWeeks: [
      { week: 1, points: 15.5 },
      { week: 2, points: 15.7 },
      { week: 3, points: 21.8 },
      { week: 4, points: 36.7 },
      { week: 5, points: 19.6 },
      { week: 6, points: 9.7 },
    ],
  });
  const chase = player({
    espnId: 4362628,
    name: "Ja'Marr Chase",
    nflTeam: "CIN",
    recentWeeks: [
      { week: 1, points: 3.2 },
      { week: 2, points: 26.5 },
      { week: 3, points: 24.8 },
      { week: 4, points: 5.7 },
      { week: 5, points: 19.7 },
    ],
  });
  const brown = player({
    espnId: 4362238,
    name: "Chase Brown",
    nflTeam: "CIN",
    position: "RB",
    recentWeeks: [
      { week: 1, points: 18.8 },
      { week: 2, points: 11.2 },
      { week: 3, points: 8.9 },
      { week: 4, points: 19.1 },
      { week: 5, points: 7 },
    ],
  });
  assert.ok(Math.abs((seasonPpgTradeValue(puka) ?? 0) - 23) < 0.05);
  assert.ok(Math.abs((seasonPpgTradeValue(kyren) ?? 0) - 19.8) < 0.05);
  assert.ok(Math.abs((seasonPpgTradeValue(chase) ?? 0) - 16) < 0.05);
  assert.ok(Math.abs((seasonPpgTradeValue(brown) ?? 0) - 13) < 0.05);
  const chat = runTradeCompare({
    sideA: [puka, kyren],
    sideB: [chase, brown],
    freshness,
  });
  assert.equal(chat.ok, true);
  if (!chat.ok) throw new Error("w7 trade failed");
  assert.ok(Math.abs(chat.giveValue - 42.8) < 0.05);
  assert.ok(Math.abs(chat.receiveValue - 29.0) < 0.05);
  // % gap vs lower side (29.0), not a blend chip total
  const expectedPct = Math.abs(42.8 - 29.0) / 29.0;
  assert.ok(Math.abs(chat.pctGap - expectedPct) < 0.01);
  assert.equal(chat.tier, "lopsided");
  assert.equal(chat.tone, "caution");
}

// ── Who to Start: chat edge === compareWhoToStart edge ──
{
  const phantom: LeagueData = {
    leagueId: "chat-test",
    season: 2026,
    name: "Test",
    currentWeek: 5,
    scoringPeriodId: 5,
    isDemo: false,
    teams: [],
    matchups: [],
    freeAgents: [a, b],
    lastSyncedAt: new Date().toISOString(),
  };
  const shared = compareWhoToStart(phantom, a, b, { flexMode: true });
  assert.equal(shared.ok, true);
  const chat = runWhoToStartCompare({
    league: phantom,
    players: [a, b],
    freshness,
  });
  assert.equal(chat.ok, true);
  if (!chat.ok || !shared.ok) throw new Error("wts failed");
  assert.equal(chat.edge, shared.edge);
  assert.equal(chat.verdictLabel, shared.verdictLabel);
  assert.equal(chat.headline, shared.headline);
}

// ── Metric cards: season PPG / last3 from same weeks (never fake 0) ──
{
  const empty = player({
    espnId: 999,
    name: "Unknown Rookie",
    nflTeam: "DAL",
    projectedPoints: null,
    recentWeeks: [],
  });
  const card = buildPlayerMetricCard(empty);
  assert.equal(card.seasonPpg, null);
  assert.equal(card.last3Avg, null);
  assert.equal(card.sleeperProj, null);
  assert.equal(card.label, "Unknown Rookie (DAL)");
}

console.log("verify-chat-tool-numbers: ok");
