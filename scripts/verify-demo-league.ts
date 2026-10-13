/**
 * Guards for real read-only demo league config + sanitization (no DB / ESPN).
 *
 * Run: npx tsx scripts/verify-demo-league.ts
 */
import assert from "node:assert/strict";
import {
  DEFAULT_DEMO_SYNC_TTL_MINUTES,
  demoLeagueConnectionIdFromEnv,
  demoLeagueSyncTtlMsFromEnv,
  isFabricatedSeedLeague,
  SEED_DEMO_LEAGUE_ID,
} from "../src/lib/demo/config";
import { sanitizeDemoLeagueForViewer } from "../src/lib/demo/real-demo";
import { createDemoLeague } from "../src/lib/demo/seed";
import type { LeagueData } from "../src/lib/types";

assert.equal(SEED_DEMO_LEAGUE_ID, "demo-league");
assert.ok(isFabricatedSeedLeague(createDemoLeague()));
assert.equal(
  isFabricatedSeedLeague({ leagueId: "123456", isDemo: true }),
  false,
);

const prevId = process.env.DEMO_LEAGUE_CONNECTION_ID;
const prevTtl = process.env.DEMO_LEAGUE_SYNC_TTL_MINUTES;

delete process.env.DEMO_LEAGUE_CONNECTION_ID;
assert.equal(demoLeagueConnectionIdFromEnv(), null);

process.env.DEMO_LEAGUE_CONNECTION_ID = "  clxyz123  ";
assert.equal(demoLeagueConnectionIdFromEnv(), "clxyz123");

delete process.env.DEMO_LEAGUE_SYNC_TTL_MINUTES;
assert.equal(
  demoLeagueSyncTtlMsFromEnv(),
  DEFAULT_DEMO_SYNC_TTL_MINUTES * 60 * 1000,
);

process.env.DEMO_LEAGUE_SYNC_TTL_MINUTES = "15";
assert.equal(demoLeagueSyncTtlMsFromEnv(), 15 * 60 * 1000);

process.env.DEMO_LEAGUE_SYNC_TTL_MINUTES = "0";
assert.equal(
  demoLeagueSyncTtlMsFromEnv(),
  DEFAULT_DEMO_SYNC_TTL_MINUTES * 60 * 1000,
);

process.env.DEMO_LEAGUE_SYNC_TTL_MINUTES = "not-a-number";
assert.equal(
  demoLeagueSyncTtlMsFromEnv(),
  DEFAULT_DEMO_SYNC_TTL_MINUTES * 60 * 1000,
);

const realish: LeagueData = {
  leagueId: "999888777",
  season: 2026,
  name: "Owner League",
  currentWeek: 4,
  scoringPeriodId: 4,
  isDemo: false,
  teams: [
    {
      id: 1,
      name: "Owner Squad",
      abbrev: "OWN",
      ownerName: "Owner",
      wins: 2,
      losses: 1,
      ties: 0,
      pointsFor: 300,
      pointsAgainst: 280,
      standing: 1,
      roster: [],
      isCurrentUser: true,
    },
  ],
  matchups: [],
  freeAgents: [],
  lastSyncedAt: new Date().toISOString(),
  userTeamId: 1,
};

const view = sanitizeDemoLeagueForViewer(realish, "Guest Ada");
assert.equal(view.isDemo, true);
assert.equal(view.leagueId, "999888777");
assert.match(view.name, /Guest Ada/);
assert.equal(
  view.teams.find((t) => t.isCurrentUser)?.name,
  "Guest Ada",
);
// Sanitizer must not invent roster points.
assert.equal(view.teams[0]?.roster.length, 0);

if (prevId === undefined) delete process.env.DEMO_LEAGUE_CONNECTION_ID;
else process.env.DEMO_LEAGUE_CONNECTION_ID = prevId;
if (prevTtl === undefined) delete process.env.DEMO_LEAGUE_SYNC_TTL_MINUTES;
else process.env.DEMO_LEAGUE_SYNC_TTL_MINUTES = prevTtl;

console.log("verify-demo-league: ok");
console.log(
  `  ttlDefault=${DEFAULT_DEMO_SYNC_TTL_MINUTES}m seedId=${SEED_DEMO_LEAGUE_ID} view=${view.name}`,
);
