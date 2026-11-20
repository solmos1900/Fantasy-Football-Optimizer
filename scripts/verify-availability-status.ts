/**
 * One shared "can't play" definition across advice screens (#155), and
 * Who to Start never says START for a DOUBTFUL player (#143).
 * Run: npx tsx scripts/verify-availability-status.ts
 */

import assert from "node:assert/strict";
import { compareWhoToStart, rankWhoToStart } from "../src/lib/insights/who-to-start";
import { buildPlayerDetailInsight } from "../src/lib/insights/player-detail";
import { chipValue, isHealthy } from "../src/lib/insights/trade-value";
import {
  isNonStartStatus,
  isUnavailableStatus,
  UNAVAILABLE_STATUSES,
} from "../src/lib/utils";
import type { FantasyPlayer, InjuryStatus, LeagueData } from "../src/lib/types";

function player(
  espnId: number,
  name: string,
  projectedPoints: number,
  injuryStatus: InjuryStatus = "ACTIVE",
): FantasyPlayer {
  return {
    id: `espn-${espnId}`,
    espnId,
    name,
    position: "RB",
    nflTeam: "DAL",
    injuryStatus,
    projectedPoints,
    actualPoints: null,
    percentOwned: 80,
    percentStarted: 70,
    opponent: "SEA",
    recentWeeks: [
      { week: 1, points: 10 },
      { week: 2, points: 10 },
      { week: 3, points: 10 },
      { week: 4, points: 10 },
    ],
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

// ── Shared sets ──
assert.deepEqual([...UNAVAILABLE_STATUSES], ["OUT", "IR", "PUP", "SUSPENSION"]);
for (const s of ["OUT", "IR", "PUP", "SUSPENSION"]) {
  assert.equal(isUnavailableStatus(s), true, s);
  assert.equal(isNonStartStatus(s), true, s);
}
assert.equal(isUnavailableStatus("DOUBTFUL"), false);
assert.equal(isNonStartStatus("DOUBTFUL"), true);
for (const s of ["ACTIVE", "QUESTIONABLE", "UNKNOWN", null, undefined]) {
  assert.equal(isNonStartStatus(s), false, String(s));
}

// ── #143: Doubtful RB projected 18 vs Active RB projected 12 ──
{
  const doubt = player(1, "Doubt Back", 18, "DOUBTFUL");
  const healthy = player(2, "Healthy Back", 12);
  for (const [a, b] of [
    [doubt, healthy],
    [healthy, doubt],
  ] as const) {
    const r = compareWhoToStart(league, a, b);
    if (!r.ok) throw new Error(r.message);
    assert.equal(r.verdict, a === healthy ? "start_a" : "start_b");
    assert.match(r.headline, /^Start Healthy Back \(DAL\)/);
  }
  // Doubtful still beats a player who is OUT.
  const out = player(3, "Out Back", 25, "OUT");
  const r = compareWhoToStart(league, out, doubt);
  if (!r.ok) throw new Error(r.message);
  assert.equal(r.verdict, "start_b");
  // Ranking: healthy, then doubtful, then unavailable.
  const ranked = rankWhoToStart(league, [out, doubt, healthy]);
  if (!ranked.ok) throw new Error(ranked.message);
  assert.deepEqual(
    ranked.ranked.map((e) => e.player.espnId),
    [2, 1, 3],
  );
}

// ── #155: PUP / SUSPENSION treated as unavailable everywhere ──
for (const status of ["PUP", "SUSPENSION"] as const) {
  const sidelined = player(10, "Sidelined Back", 20, status);
  const healthy = player(11, "Healthy Back", 8);

  const wts = compareWhoToStart(league, sidelined, healthy);
  if (!wts.ok) throw new Error(wts.message);
  assert.equal(wts.verdict, "start_b", `${status}: Who to Start`);

  const detail = buildPlayerDetailInsight(league, sidelined);
  assert.equal(detail.lean, "SIT", `${status}: player detail`);

  assert.equal(isHealthy(sidelined), false, `${status}: trade isHealthy`);
  const full = chipValue(player(12, "Same Back", 20));
  assert.ok(
    chipValue(sidelined) < full * 0.5,
    `${status}: trade chip value is discounted`,
  );
}

console.log("verify-availability-status: ok");
