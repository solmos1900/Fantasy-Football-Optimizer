/**
 * Regression guard for guest / no-league entry (no DB required).
 *
 * Product guests use the NFL player pool (see verify-no-league-pool.ts) —
 * this script keeps exercising insights against the in-memory seed fixture
 * only, and asserts the product connect path no longer serves demo leagues.
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
import {
  buildInsightsBundle,
  generateInsights,
} from "../src/lib/insights/engine";
import { buildPlayerDetailInsight } from "../src/lib/insights/player-detail";
import { analyzeTrade } from "../src/lib/insights/trade-analyzer";
import { computeTrendsFromLeague } from "../src/lib/insights/trends";
import { analyzeDefenseMatchup, matchupContextFromLeague } from "../src/lib/insights/defense-matchups";
import { fullPprFromCategories } from "../src/lib/players/scoring";

const displayName = "CrashTest Guest";
const league = applyDemoOwnerDisplayName(
  createDemoLeague(1, { ownerDisplayName: displayName }),
  displayName,
);

assert.equal(league.isDemo, true);
assert.equal(league.leagueId, "demo-league");

const myTeam =
  league.teams.find((t) => t.isCurrentUser) ??
  league.teams.find((t) => t.id === league.userTeamId);
assert.ok(myTeam, "fixture must expose a current-user team");

const trends = computeTrendsFromLeague(league);
assert.ok(trends.size > 0, "fixture players should yield in-memory trends");

const insights = generateInsights(league);
assert.ok(Array.isArray(insights), "generateInsights must return an array");
assert.doesNotThrow(() => buildInsightsBundle(league, [], trends));

const pool = league.teams.flatMap((t) => t.roster);
const ctx = matchupContextFromLeague(league);
for (const player of pool.slice(0, 12)) {
  const matchup = analyzeDefenseMatchup(player, pool, ctx);
  assert.ok(matchup);
  const detail = buildPlayerDetailInsight(
    league,
    player,
    trends.get(player.espnId) ?? null,
  );
  assert.ok(detail.headline);
}

const partner = league.teams.find((t) => !t.isCurrentUser && t.id !== myTeam.id);
assert.ok(partner);
const give = myTeam.roster.filter((p) => p.isStarter).slice(0, 1);
const receive = partner.roster.filter((p) => p.isStarter).slice(0, 1);
const grade = analyzeTrade(myTeam, partner, give, receive, trends);
assert.ok(grade?.verdict);

// Full-PPR formula smoke (honest category math).
assert.equal(
  fullPprFromCategories({
    receptions: 5,
    recYards: 50,
    recTd: 1,
    rushYards: 20,
  }),
  18, // 5 + 5 + 6 + 2
);

// Product connect path must not offer demo leagues.
const service = fs.readFileSync(
  path.join(process.cwd(), "src/lib/league/service.ts"),
  "utf8",
);
assert.doesNotMatch(service, /connectDemoLeague/);
assert.doesNotMatch(service, /getFreshDemoSourceLeague/);
assert.doesNotMatch(service, /DEMO_LEAGUE_CONNECTION_ID/);

const connectRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/league/connect/route.ts"),
  "utf8",
);
assert.match(connectRoute, /Demo leagues are no longer available/);

const onboarding = fs.readFileSync(
  path.join(process.cwd(), "src/lib/onboarding/content.ts"),
  "utf8",
);
assert.match(onboarding, /SWID \(private\)/);
assert.match(onboarding, /Coming soon/);

console.log("verify-guest-entry: ok");
