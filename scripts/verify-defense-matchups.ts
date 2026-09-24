/**
 * Trust guardrails for defense matchup comps.
 * Run: npx tsx scripts/verify-defense-matchups.ts
 */
import assert from "node:assert/strict";
import {
  analyzeDefenseMatchup,
  emptyDefenseMatchupMessage,
  isCompletedWeek,
  matchupContextFromLeague,
} from "../src/lib/insights/defense-matchups";
import { buildPlayerDetailInsight } from "../src/lib/insights/player-detail";
import { createDemoLeague } from "../src/lib/demo/seed";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";

assert.equal(isCompletedWeek(6, 3), false, "week 6 must be incomplete when current is 3");
assert.equal(isCompletedWeek(2, 3), true);
assert.equal(isCompletedWeek(3, 3), false);

const fabricatedWeek6: FantasyPlayer = {
  id: "evil",
  espnId: 1,
  name: "Bo Nix",
  position: "QB",
  nflTeam: "DEN",
  injuryStatus: "ACTIVE",
  projectedPoints: 18,
  actualPoints: 0,
  percentOwned: 50,
  percentStarted: 40,
  opponent: "vs CLE",
  role: "qb",
  recentWeeks: [
    { week: 6, points: 12.1, opponent: "vs CLE" },
    { week: 2, points: 14.0, opponent: "vs KC" },
  ],
};

const subject: FantasyPlayer = {
  id: "subj",
  espnId: 2,
  name: "Test QB",
  position: "QB",
  nflTeam: "PIT",
  injuryStatus: "ACTIVE",
  projectedPoints: 16,
  actualPoints: 0,
  percentOwned: 40,
  percentStarted: 30,
  opponent: "@ CLE",
  role: "qb",
};

const liveLeague: LeagueData = {
  leagueId: "live",
  season: 2026,
  name: "Live",
  currentWeek: 3,
  scoringPeriodId: 3,
  isDemo: false,
  teams: [
    {
      id: 1,
      name: "A",
      abbrev: "A",
      ownerName: "A",
      wins: 1,
      losses: 1,
      ties: 0,
      pointsFor: 100,
      pointsAgainst: 90,
      standing: 1,
      roster: [subject, fabricatedWeek6],
      isCurrentUser: true,
    },
  ],
  matchups: [],
  freeAgents: [],
  lastSyncedAt: new Date().toISOString(),
  userTeamId: 1,
};

const ctx = matchupContextFromLeague(liveLeague);
const result = analyzeDefenseMatchup(subject, [subject, fabricatedWeek6], ctx);
assert.ok(result);
assert.equal(result!.samples.length, 0, "must ignore week 6 when current week is 3");
assert.match(
  result!.emptyReason ?? "",
  /Not enough completed games/,
);

const insight = buildPlayerDetailInsight(liveLeague, subject);
assert.equal(insight.comps.length, 0);
assert.ok(insight.compsEmptyMessage);
assert.doesNotMatch(
  insight.comps.map((c) => c.blurb).join(" "),
  /week 6/i,
);
assert.doesNotMatch(
  JSON.stringify(insight),
  /seeded/i,
);

const demo = createDemoLeague();
assert.equal(demo.currentWeek, 3);
assert.equal(demo.scoringPeriodId, 3);
for (const p of demo.teams.flatMap((t) => t.roster)) {
  for (const w of p.recentWeeks ?? []) {
    assert.ok(
      w.week < demo.scoringPeriodId,
      `demo recent week ${w.week} must be before current ${demo.scoringPeriodId}`,
    );
  }
}

const msg = emptyDefenseMatchupMessage("QB", "CLE", 3);
assert.match(msg, /CLE/);
assert.match(msg, /Not enough completed games/);

console.log("verify-defense-matchups: OK");
