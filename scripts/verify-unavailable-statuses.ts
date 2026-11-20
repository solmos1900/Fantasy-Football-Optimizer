/**
 * Regression (#155, #143): every advice surface must agree on who can't play.
 * OUT / IR / PUP / SUSPENSION are unavailable everywhere, and Who to Start
 * never says START for a DOUBTFUL player over a healthy one.
 *
 * Run: npm run verify:unavailable-statuses
 */

import assert from "node:assert/strict";
import { compareWhoToStart } from "../src/lib/insights/who-to-start";
import { buildPlayerDetailInsight } from "../src/lib/insights/player-detail";
import { chipValue, isHealthy } from "../src/lib/insights/trade-value";
import { deriveTrendFromWeeks } from "../src/lib/insights/trends";
import { generateInsights } from "../src/lib/insights/engine";
import {
  isNonStarterStatus,
  isUnavailableStatus,
  UNAVAILABLE_INJURY_STATUSES,
} from "../src/lib/utils";
import type {
  FantasyPlayer,
  FantasyTeam,
  InjuryStatus,
  LeagueData,
} from "../src/lib/types";

function player(
  partial: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "name" | "nflTeam" | "espnId">,
): FantasyPlayer {
  return {
    id: partial.id ?? `id-${partial.espnId}`,
    espnId: partial.espnId,
    name: partial.name,
    position: partial.position ?? "RB",
    nflTeam: partial.nflTeam,
    injuryStatus: partial.injuryStatus ?? "ACTIVE",
    projectedPoints: partial.projectedPoints ?? 10,
    actualPoints: 0,
    percentOwned: 80,
    percentStarted: 60,
    opponent: partial.opponent ?? "@NYJ",
    isStarter: partial.isStarter,
    slot: partial.slot,
    recentWeeks: partial.recentWeeks ?? [
      { week: 1, points: partial.projectedPoints ?? 10 },
      { week: 2, points: partial.projectedPoints ?? 10 },
      { week: 3, points: partial.projectedPoints ?? 10 },
    ],
  };
}

function team(roster: FantasyPlayer[]): FantasyTeam {
  return {
    id: 1,
    name: "Mine",
    abbrev: "MINE",
    ownerName: "Me",
    wins: 4,
    losses: 3,
    ties: 0,
    pointsFor: 700,
    pointsAgainst: 680,
    standing: 1,
    roster,
  };
}

function league(roster: FantasyPlayer[]): LeagueData {
  return {
    leagueId: "L1",
    season: 2026,
    name: "Test League",
    currentWeek: 5,
    scoringPeriodId: 5,
    isDemo: false,
    teams: [team(roster)],
    matchups: [],
    freeAgents: [],
    lastSyncedAt: new Date().toISOString(),
    userTeamId: 1,
  };
}

// --- Shared definition -------------------------------------------------------
assert.deepEqual([...UNAVAILABLE_INJURY_STATUSES], ["OUT", "IR", "PUP", "SUSPENSION"]);
for (const s of ["OUT", "IR", "PUP", "SUSPENSION", "pup", " suspension "]) {
  assert.ok(isUnavailableStatus(s), `${s} should be unavailable`);
  assert.ok(isNonStarterStatus(s), `${s} should be a non-starter`);
}
for (const s of ["ACTIVE", "QUESTIONABLE", "DOUBTFUL", "UNKNOWN", "", null, undefined]) {
  assert.ok(!isUnavailableStatus(s), `${String(s)} should not be unavailable`);
}
assert.ok(isNonStarterStatus("DOUBTFUL"));
assert.ok(!isNonStarterStatus("QUESTIONABLE"));

const UNAVAILABLE: InjuryStatus[] = ["OUT", "IR", "PUP", "SUSPENSION"];

for (const status of UNAVAILABLE) {
  // --- Who to Start (#155): big projection, still never START ---------------
  const down = player({ name: "Down Back", nflTeam: "BUF", espnId: 1, projectedPoints: 22, injuryStatus: status });
  const healthy = player({ name: "Healthy Back", nflTeam: "MIA", espnId: 2, projectedPoints: 9 });
  const lg = league([down, healthy]);
  const r1 = compareWhoToStart(lg, down, healthy);
  assert.ok(r1.ok);
  assert.equal(r1.verdict, "start_b", `Who to Start: ${status} player A must lose (got ${r1.verdict})`);
  const r2 = compareWhoToStart(lg, healthy, down);
  assert.ok(r2.ok);
  assert.equal(r2.verdict, "start_a", `Who to Start: ${status} player B must lose (got ${r2.verdict})`);

  // --- Player detail (#155): forced SIT ------------------------------------
  const detail = buildPlayerDetailInsight(lg, down, null);
  assert.equal(detail.lean, "SIT", `Player detail: ${status} must be SIT (got ${detail.lean})`);

  // --- Trade value (#155): discounted, not healthy -------------------------
  const fit = { ...down, injuryStatus: "ACTIVE" as const };
  assert.ok(!isHealthy(down), `Trade value: ${status} must not count as healthy`);
  assert.ok(
    chipValue(down) < chipValue(fit) * 0.5,
    `Trade value: ${status} must be discounted (${chipValue(down)} vs ${chipValue(fit)})`,
  );

  // --- Trends (#155): flagged as injury risk -------------------------------
  const trend = deriveTrendFromWeeks(
    "Down Back",
    [
      { week: 2, projectedPpr: 15, actualPpr: 18 },
      { week: 3, projectedPpr: 15, actualPpr: 20 },
      { week: 4, projectedPpr: 15, actualPpr: 22 },
    ],
    status,
  );
  assert.equal(trend.trendLabel, "InjuryRisk", `Trends: ${status} must be InjuryRisk (got ${trend.trendLabel})`);

  // --- Insights engine (#155): never START an unavailable bench player -----
  const starter = player({ name: "Weak Starter", nflTeam: "NYG", espnId: 3, projectedPoints: 6, isStarter: true, slot: "RB" });
  const benchDown = player({ name: "Bench Down", nflTeam: "DAL", espnId: 4, projectedPoints: 20, injuryStatus: status, isStarter: false, slot: "BN" });
  const recs = generateInsights(league([starter, benchDown]));
  const bad = recs.filter(
    (r) => r.type === "start_sit" && r.verdict === "START" && r.relatedPlayerIds?.[0] === benchDown.id,
  );
  assert.equal(bad.length, 0, `Engine: must not recommend starting a ${status} bench player: ${bad.map((r) => r.title).join(" | ")}`);
}

// --- Who to Start (#143): Doubtful never beats a healthy player -------------
{
  const doubtful = player({ name: "Doubtful Back", nflTeam: "BUF", espnId: 11, projectedPoints: 18, injuryStatus: "DOUBTFUL" });
  const active = player({ name: "Active Back", nflTeam: "MIA", espnId: 12, projectedPoints: 12 });
  const lg = league([doubtful, active]);
  const r1 = compareWhoToStart(lg, doubtful, active);
  assert.ok(r1.ok);
  assert.equal(r1.verdict, "start_b", `Doubtful A (18) vs Active B (12) must start B (got ${r1.verdict})`);
  assert.ok(r1.edge < 0, "edge must favor B");
  const r2 = compareWhoToStart(lg, active, doubtful);
  assert.ok(r2.ok);
  assert.equal(r2.verdict, "start_a", `Active A vs Doubtful B must start A (got ${r2.verdict})`);

  // Doubtful still beats a player who definitely can't play.
  const out = player({ name: "Out Back", nflTeam: "NYJ", espnId: 13, projectedPoints: 20, injuryStatus: "OUT" });
  const r3 = compareWhoToStart(league([doubtful, out]), doubtful, out);
  assert.ok(r3.ok);
  assert.equal(r3.verdict, "start_a", `Doubtful vs OUT must start the Doubtful player (got ${r3.verdict})`);

  // Two Doubtful players: no forced verdict, projections decide.
  const doubtful2 = player({ name: "Other Doubtful", nflTeam: "KC", espnId: 14, projectedPoints: 8, injuryStatus: "DOUBTFUL" });
  const r4 = compareWhoToStart(league([doubtful, doubtful2]), doubtful, doubtful2);
  assert.ok(r4.ok);
  assert.ok(r4.verdict === "start_a" || r4.verdict === "lean_a", `Both Doubtful: projection leader wins (got ${r4.verdict})`);
}

console.log("verify-unavailable-statuses: ok");
