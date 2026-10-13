/**
 * Regression guard for guest / demo entry (no DB required).
 *
 * Product guests load a real ESPN snapshot via DEMO_LEAGUE_CONNECTION_ID
 * (see verify-demo-league.ts). This script keeps exercising insights /
 * defense / trade analyzer against the in-memory seed fixture only — never
 * as a product data path.
 *
 * Run: npx tsx scripts/verify-guest-entry.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyDemoOwnerDisplayName,
  createDemoLeague,
} from "../src/lib/demo/seed";
import { isFabricatedSeedLeague } from "../src/lib/demo/config";
import {
  buildInsightsBundle,
  generateInsights,
} from "../src/lib/insights/engine";
import { buildPlayerDetailInsight } from "../src/lib/insights/player-detail";
import { analyzeTrade } from "../src/lib/insights/trade-analyzer";
import { computeTrendsFromLeague } from "../src/lib/insights/trends";
import { analyzeDefenseMatchup, matchupContextFromLeague } from "../src/lib/insights/defense-matchups";

const displayName = "CrashTest Guest";
const league = applyDemoOwnerDisplayName(
  createDemoLeague(1, { ownerDisplayName: displayName }),
  displayName,
);

assert.equal(league.isDemo, true);
assert.ok(isFabricatedSeedLeague(league));
assert.equal(league.scoringPeriodId, 3);
assert.equal(league.currentWeek, 3);
assert.match(league.name, /CrashTest Guest/);

const myTeam =
  league.teams.find((t) => t.isCurrentUser) ??
  league.teams.find((t) => t.id === league.userTeamId);
assert.ok(myTeam, "demo must expose a current-user team");
assert.equal(myTeam.name, displayName);

const trends = computeTrendsFromLeague(league);
assert.ok(trends.size > 0, "demo players should yield in-memory trends");

const insights = generateInsights(league);
assert.ok(Array.isArray(insights), "generateInsights must return an array");
assert.doesNotThrow(() => buildInsightsBundle(league, [], trends));

const pool = league.teams.flatMap((t) => t.roster);
const ctx = matchupContextFromLeague(league);
for (const player of pool.slice(0, 12)) {
  const matchup = analyzeDefenseMatchup(player, pool, ctx);
  assert.ok(matchup);
  assert.ok(Array.isArray(matchup.samples));
  // Never invent samples for the current / future week.
  for (const sample of matchup.samples) {
    assert.ok(
      sample.week < league.scoringPeriodId,
      `sample week ${sample.week} must be completed vs scoringPeriod ${league.scoringPeriodId}`,
    );
  }
  const detail = buildPlayerDetailInsight(
    league,
    player,
    trends.get(player.espnId) ?? null,
  );
  assert.ok(detail.headline);
  assert.ok(Array.isArray(detail.comps));
  if (detail.comps.length === 0) {
    assert.ok(
      detail.compsEmptyMessage,
      "thin samples must surface an honest empty message",
    );
  }
}

const partner = league.teams.find((t) => !t.isCurrentUser && t.id !== myTeam.id);
assert.ok(partner, "demo needs a trade partner");
const give = myTeam.roster.filter((p) => p.isStarter).slice(0, 1);
const receive = partner.roster.filter((p) => p.isStarter).slice(0, 1);
assert.ok(give.length && receive.length);

const grade = analyzeTrade(myTeam, partner, give, receive, trends);
assert.ok(grade, "analyzeTrade should return a grade for non-empty sides");
assert.ok(grade.verdict);
assert.ok(grade.verdictLabel);
assert.equal(typeof grade.giveValue, "number");
assert.equal(typeof grade.receiveValue, "number");
assert.ok(grade.summary);

// Product connect path must not call createDemoLeague.
const service = fs.readFileSync(
  path.join(process.cwd(), "src/lib/league/service.ts"),
  "utf8",
);
assert.doesNotMatch(service, /createDemoLeague/);
assert.match(service, /getFreshDemoSourceLeague/);

// Connect guide must document ESPN field labels and Coming soon for Sleeper.
const onboarding = fs.readFileSync(
  path.join(process.cwd(), "src/lib/onboarding/content.ts"),
  "utf8",
);
assert.match(onboarding, /SWID \(private\)/);
assert.match(onboarding, /espn_s2 \(private\)/);
assert.match(onboarding, /available: false/);
assert.match(onboarding, /Coming soon/);

console.log("verify-guest-entry: ok");
console.log(
  `  fixture=${league.name} week=${league.scoringPeriodId} insights=${insights.length} trends=${trends.size} verdict=${grade.verdictLabel}`,
);
