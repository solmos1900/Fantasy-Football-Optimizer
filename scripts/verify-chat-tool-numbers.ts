/**
 * Chat answers' numbers must equal underlying tool / shared-logic outputs.
 * Run: npx tsx scripts/verify-chat-tool-numbers.ts
 */

import assert from "node:assert/strict";
import { comparePlayerPackages } from "../src/lib/insights/trade-analyzer";
import { whoBenefitsCopy } from "../src/lib/insights/trade-benefits";
import { compareWhoToStart } from "../src/lib/insights/who-to-start";
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

// ── Trade: chat runner numbers === comparePlayerPackages + whoBenefitsCopy ──
{
  const shared = comparePlayerPackages([a, c], [b, d]);
  assert.ok(shared);
  const chat = runTradeCompare({
    sideA: [a, c],
    sideB: [b, d],
    freshness,
  });
  assert.equal(chat.ok, true);
  if (!chat.ok) throw new Error("trade failed");
  assert.equal(chat.giveValue, shared!.giveValue);
  assert.equal(chat.receiveValue, shared!.receiveValue);
  assert.equal(chat.valueGap, shared!.valueGap);
  const benefit = whoBenefitsCopy(
    shared!.valueGap,
    "free",
    shared!.giveValue,
    shared!.receiveValue,
  );
  assert.equal(chat.headline, benefit.headline);
  assert.equal(chat.differenceLabel, benefit.differenceLabel);
  assert.equal(chat.winner, benefit.winner);
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
