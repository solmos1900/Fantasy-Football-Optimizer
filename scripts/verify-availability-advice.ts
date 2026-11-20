/**
 * Regression checks for #143 (Doubtful START), #154 (chat multi-player Who to
 * Start skipping the best player) and #155 (PUP / SUSPENSION treated as
 * available on some advice screens).
 * Run: npx tsx scripts/verify-availability-advice.ts
 */

import assert from "node:assert/strict";
import { compareWhoToStart } from "../src/lib/insights/who-to-start";
import { buildPlayerDetailInsight } from "../src/lib/insights/player-detail";
import { chipValue, isHealthy } from "../src/lib/insights/trade-value";
import {
  isNonStartStatus,
  isUnavailableStatus,
} from "../src/lib/insights/availability";
import { runWhoToStartCompare } from "../src/lib/chat/tool-runners";
import type { FantasyPlayer, InjuryStatus, LeagueData } from "../src/lib/types";
import type { PlayerPoolFreshness } from "../src/lib/players/pool";

function player(
  espnId: number,
  name: string,
  projectedPoints: number | null,
  injuryStatus: InjuryStatus = "ACTIVE",
  position: FantasyPlayer["position"] = "RB",
): FantasyPlayer {
  return {
    id: `espn-${espnId}`,
    espnId,
    name,
    position,
    nflTeam: "KC",
    injuryStatus,
    projectedPoints,
    actualPoints: null,
    percentOwned: 80,
    percentStarted: 70,
    opponent: "SEA",
    recentWeeks: [],
  };
}

const league: LeagueData = {
  leagueId: "availability-test",
  season: 2026,
  name: "Test",
  currentWeek: 5,
  scoringPeriodId: 5,
  isDemo: false,
  teams: [],
  matchups: [],
  freeAgents: [],
  lastSyncedAt: new Date().toISOString(),
};

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

// ── Shared availability sets (#155) ──
for (const s of ["OUT", "IR", "PUP", "SUSPENSION"] as const) {
  assert.equal(isUnavailableStatus(s), true, `${s} is unavailable`);
  assert.equal(isNonStartStatus(s), true, `${s} is a non-start`);
}
assert.equal(isUnavailableStatus("DOUBTFUL"), false);
assert.equal(isNonStartStatus("DOUBTFUL"), true);
for (const s of ["ACTIVE", "QUESTIONABLE", "UNKNOWN"] as const) {
  assert.equal(isNonStartStatus(s), false, `${s} can start`);
}

// ── #143: Doubtful 18 vs Active 12 → START the healthy player ──
{
  const doubtful = player(1, "Doubtful Back", 18, "DOUBTFUL");
  const healthy = player(2, "Healthy Back", 12);
  const ab = compareWhoToStart(league, doubtful, healthy);
  assert.ok(ab.ok);
  if (ab.ok) {
    assert.equal(ab.verdict, "start_b");
    assert.ok(ab.edge < 0, "edge favors the healthy side");
    assert.match(ab.headline, /Start Healthy Back/);
  }
  const ba = compareWhoToStart(league, healthy, doubtful);
  assert.ok(ba.ok);
  if (ba.ok) assert.equal(ba.verdict, "start_a");

  // Both Doubtful: fall back to the normal projection call.
  const d2 = player(3, "Other Doubtful", 10, "DOUBTFUL");
  const both = compareWhoToStart(league, doubtful, d2);
  assert.ok(both.ok);
  if (both.ok) assert.equal(both.verdict, "start_a");

  // Doubtful still beats a player who is OUT.
  const out = player(4, "Out Back", 20, "OUT");
  const vsOut = compareWhoToStart(league, out, doubtful);
  assert.ok(vsOut.ok);
  if (vsOut.ok) assert.equal(vsOut.verdict, "start_b");
}

// ── #155: PUP / SUSPENSION are unavailable on every advice screen ──
for (const status of ["PUP", "SUSPENSION"] as const) {
  const sidelined = player(10, `Sidelined ${status}`, 20, status);
  const healthy = player(11, "Healthy Back", 8);

  const wts = compareWhoToStart(league, sidelined, healthy);
  assert.ok(wts.ok);
  if (wts.ok) assert.equal(wts.verdict, "start_b", `WTS sits ${status}`);

  const detail = buildPlayerDetailInsight(league, sidelined);
  assert.equal(detail.lean, "SIT", `player detail sits ${status}`);

  assert.equal(isHealthy(sidelined), false, `trade depth skips ${status}`);
  const sameButActive = player(12, "Same Guy", 20);
  assert.ok(
    chipValue(sidelined) < chipValue(sameButActive) * 0.5,
    `trade chip value discounts ${status}`,
  );
}

// ── #154: chat ranks every player (15 / 20 / 5 → the 20) ──
{
  const a = player(21, "Fifteen Back", 15);
  const b = player(22, "Twenty Back", 20);
  const c = player(23, "Five Back", 5);
  const chat = runWhoToStartCompare({ league, players: [a, b, c], freshness });
  assert.ok(chat.ok);
  if (chat.ok) {
    assert.match(chat.headline, /^Start Twenty Back/);
    assert.equal(chat.players[0]?.label.startsWith("Twenty Back"), true);
    assert.equal(chat.players.length, 3);
  }

  // Best-projected player is Doubtful → chat must pick the healthy runner-up.
  const d = player(24, "Doubtful Star", 25, "DOUBTFUL");
  const chat2 = runWhoToStartCompare({
    league,
    players: [a, d, c],
    freshness,
  });
  assert.ok(chat2.ok);
  if (chat2.ok) assert.match(chat2.headline, /^Start Fifteen Back/);

  // Order of input never changes the pick.
  const chat3 = runWhoToStartCompare({ league, players: [c, a, b], freshness });
  assert.ok(chat3.ok);
  if (chat3.ok) assert.match(chat3.headline, /^Start Twenty Back/);
}

console.log("verify-availability-advice: ok");
