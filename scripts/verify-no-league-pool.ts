/**
 * No-league pool freshness + scoring guards (no DB / no network).
 *
 * Run: npx tsx scripts/verify-no-league-pool.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  formatPoolFreshnessLabel,
  POOL_PROJECTION_TTL_MS,
  type PlayerPoolFreshness,
} from "../src/lib/players/pool";
import {
  fullPprFromCategories,
  fullPprFromEspnStatMap,
  fullPprFromNflverseRow,
} from "../src/lib/players/scoring";
import { mapEspnPublicPlayer } from "../src/lib/players/espn-public";

assert.ok(POOL_PROJECTION_TTL_MS <= 15 * 60 * 1000);

const freshness: PlayerPoolFreshness = {
  season: 2026,
  currentWeek: 5,
  statsThroughWeek: 4,
  statsUpdatedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  projectionsUpdatedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  latestWeekMissing: false,
  warning: null,
  scoringLabel: "Full PPR (default — no league scoring settings)",
};
const label = formatPoolFreshnessLabel(freshness);
assert.match(label, /Stats through Week 4/);
assert.match(label, /updated/);

assert.equal(
  fullPprFromCategories({
    passYards: 250,
    passTd: 2,
    interceptions: 1,
    rushYards: 30,
    rushTd: 1,
  }),
  25, // 10 + 8 - 2 + 3 + 6
);

assert.equal(
  fullPprFromEspnStatMap({
    "3": 250,
    "4": 2,
    "20": 1,
    "24": 30,
    "25": 1,
  }),
  25,
);

assert.equal(
  fullPprFromNflverseRow({
    passing_yards: "250",
    passing_tds: "2",
    passing_interceptions: "1",
    rushing_yards: "30",
    rushing_tds: "1",
  }),
  25,
);

const mapped = mapEspnPublicPlayer(
  {
    id: 3918298,
    fullName: "Josh Allen",
    defaultPositionId: 1,
    proTeamId: 2,
    injuryStatus: "ACTIVE",
    ownership: { percentOwned: 99, percentStarted: 98 },
    stats: [
      {
        scoringPeriodId: 5,
        statSourceId: 1,
        statSplitTypeId: 1,
        stats: { "3": 250, "4": 2, "20": 0, "24": 20, "25": 0 },
      },
      {
        scoringPeriodId: 4,
        statSourceId: 0,
        statSplitTypeId: 1,
        stats: { "3": 280, "4": 3, "20": 1, "24": 15, "25": 1 },
      },
    ],
  },
  5,
);
assert.ok(mapped);
assert.equal(mapped.position, "QB");
assert.ok(
  mapped.projectedPoints != null && mapped.projectedPoints > 0,
);
assert.ok((mapped.recentWeeks?.length ?? 0) >= 1);

const poolSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/players/pool.ts"),
  "utf8",
);
assert.match(poolSrc, /ensureCompletedWeekIngest/);
assert.match(poolSrc, /POOL_PROJECTION_TTL_MS/);
assert.doesNotMatch(poolSrc, /DEMO_LEAGUE/);

const service = fs.readFileSync(
  path.join(process.cwd(), "src/lib/league/service.ts"),
  "utf8",
);
assert.doesNotMatch(service, /DEMO_LEAGUE_CONNECTION_ID/);

// Live current-week scoreboard must NOT pin bare dates=<year> (that returns week 18).
const espnClient = fs.readFileSync(
  path.join(process.cwd(), "src/lib/espn/client.ts"),
  "utf8",
);
assert.match(espnClient, /Only pin the season year when a specific week/);
assert.match(espnClient, /if \(week\)/);

console.log("verify-no-league-pool: ok");
console.log(`  label=${label} joshProj=${mapped.projectedPoints}`);
