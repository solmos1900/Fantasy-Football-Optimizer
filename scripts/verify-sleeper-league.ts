/**
 * Unit guard: Sleeper league connect mapping (no network).
 * Run: npm run verify:sleeper-league
 */

import assert from "node:assert/strict";
import {
  dropByeWeekZeros,
  projectionForFormat,
  scoringFormatFromSettings,
  sleeperScoringLabel,
} from "../src/lib/sleeper/league";
import {
  SYNTHETIC_ESPN_ID_BASE,
  espnDefenseIdForTeam,
  isSyntheticEspnId,
  syntheticEspnId,
} from "../src/lib/sleeper/id-crosswalk";
import {
  leaguePlatformLabel,
  leagueReportsOwnership,
} from "../src/lib/league/team";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";

// Scoring format from reception points; label adds Superflex / TE premium.
assert.equal(scoringFormatFromSettings({ rec: 1 }), "ppr");
assert.equal(scoringFormatFromSettings({ rec: 0.5 }), "half_ppr");
assert.equal(scoringFormatFromSettings({ rec: 0 }), "std");
assert.equal(scoringFormatFromSettings(null), "std");
assert.equal(sleeperScoringLabel({ rec: 0.5 }, ["QB", "RB", "FLEX"]), "Half PPR");
assert.equal(
  sleeperScoringLabel({ rec: 1, bonus_rec_te: 0.5 }, ["QB", "SUPER_FLEX"]),
  "Full PPR · Superflex · TE premium",
);

// Projections read exactly the league's field — never a fallback.
const stats = { pts_ppr: 10.87, pts_half_ppr: 9.02, pts_std: 7.17 };
assert.equal(projectionForFormat(stats, "ppr"), 10.9);
assert.equal(projectionForFormat(stats, "half_ppr"), 9);
assert.equal(projectionForFormat(stats, "std"), 7.2);
assert.equal(projectionForFormat({ pts_ppr: 12 }, "half_ppr"), null);

// Defenses map onto ESPN D/ST ids; unknown players get a synthetic id.
assert.equal(espnDefenseIdForTeam("NE"), -16017);
assert.equal(espnDefenseIdForTeam("LA"), -16014); // nflverse/Sleeper LA → LAR
assert.equal(espnDefenseIdForTeam("FA"), null);
assert.equal(syntheticEspnId("13270"), SYNTHETIC_ESPN_ID_BASE + 13270);
assert.ok(isSyntheticEspnId(syntheticEspnId("abc")));
assert.ok(!isSyntheticEspnId(4426515));
assert.ok(syntheticEspnId("199999999") < 2_147_483_647); // fits Postgres INT

// Bye-week zeros (no game on the scoreboard) are dropped, real zeros kept.
const player = {
  id: "espn-1",
  espnId: 1,
  name: "Test Player",
  position: "WR",
  nflTeam: "CAR",
  injuryStatus: "ACTIVE",
  projectedPoints: null,
  actualPoints: null,
  percentOwned: 0,
  percentStarted: 0,
  recentWeeks: [
    { week: 6, points: 11.6, opponent: "@PHI" },
    { week: 5, points: 0 }, // bye
    { week: 4, points: 0, opponent: "vs DET" }, // played, scored 0
  ],
} as FantasyPlayer;
const league = {
  leagueId: "1",
  season: 2026,
  name: "L",
  currentWeek: 7,
  scoringPeriodId: 7,
  isDemo: false,
  teams: [{ id: 1, name: "T", abbrev: "T", ownerName: "O", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, standing: 1, roster: [player] }],
  matchups: [],
  freeAgents: [],
  lastSyncedAt: "",
  platform: "sleeper",
} as LeagueData;
const fixed = dropByeWeekZeros(league).teams[0]!.roster[0]!;
assert.deepEqual(fixed.recentWeeks!.map((w) => w.week), [6, 4]);

// Ownership is hidden for Sleeper (no fake 0%); headers name the host.
assert.equal(leagueReportsOwnership(league), false);
assert.equal(leagueReportsOwnership({ platform: undefined }), true);
assert.equal(leaguePlatformLabel(league), "Sleeper");
assert.equal(leaguePlatformLabel({ platform: undefined, isDemo: false }), "ESPN");

console.log("verify-sleeper-league: ok");
