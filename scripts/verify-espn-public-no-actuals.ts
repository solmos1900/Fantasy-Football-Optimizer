/**
 * Regression: ESPN public mapping must not emit completed-week actuals or
 * recentWeeks (#125). Mixed 2025/2026 seasonId blocks must not become 2026
 * scores. DB weeks must survive the injury/ownership overlay.
 *
 * Run: npm run verify:espn-public-no-actuals
 */
import assert from "node:assert/strict";
import {
  mapEspnPublicPlayer,
  overlayEspnInjuryOwnership,
} from "../src/lib/players/espn-public";
import type { FantasyPlayer } from "../src/lib/types";

const scoringPeriodId = 7; // current week — completed weeks are < 7

const mixedSeasonRow = {
  id: 15847,
  fullName: "Travis Kelce",
  defaultPositionId: 4,
  proTeamId: 12,
  injuryStatus: "ACTIVE",
  ownership: { percentOwned: 99, percentStarted: 97 },
  stats: [
    // 2026 W1 actual (would be correct if we trusted ESPN — we don't)
    {
      scoringPeriodId: 1,
      seasonId: 2026,
      statSourceId: 0,
      statSplitTypeId: 1,
      appliedTotal: 10.1,
      stats: { "53": 5, "42": 61, "43": 0 },
    },
    // 2025 W1 actual — same week number, prior season (the bug source)
    {
      scoringPeriodId: 1,
      seasonId: 2025,
      statSourceId: 0,
      statSplitTypeId: 1,
      appliedTotal: 12.7,
      stats: { "53": 6, "42": 78, "43": 0 },
    },
    // 2025 W5 (KC bye in 2026) — would show as impossible bye points
    {
      scoringPeriodId: 5,
      seasonId: 2025,
      statSourceId: 0,
      statSplitTypeId: 1,
      appliedTotal: 19.1,
      stats: { "53": 7, "42": 91, "43": 1 },
    },
    // Current-week projection (allowed for persist; display uses Sleeper)
    {
      scoringPeriodId: 7,
      seasonId: 2026,
      statSourceId: 1,
      statSplitTypeId: 1,
      appliedTotal: 12.0,
      stats: { "53": 5, "42": 55, "43": 0 },
    },
  ],
};

const mapped = mapEspnPublicPlayer(
  mixedSeasonRow as Parameters<typeof mapEspnPublicPlayer>[0],
  scoringPeriodId,
);
assert.ok(mapped, "Kelce should map");
assert.equal(mapped!.actualPoints, null, "no ESPN actualPoints");
assert.deepEqual(
  mapped!.recentWeeks ?? [],
  [],
  "no ESPN recentWeeks — mixed 2025/2026 blocks must not yield 2026 actuals",
);
assert.ok(
  mapped!.projectedPoints == null || Number.isFinite(mapped!.projectedPoints),
  "current-week projection may still be present",
);
assert.equal(mapped!.percentOwned, 99);
assert.equal(mapped!.injuryStatus, "ACTIVE");

// Overlay must keep DB/nflverse weeks, only update injury/ownership.
const dbPlayer: FantasyPlayer = {
  id: "espn-15847",
  espnId: 15847,
  name: "Travis Kelce",
  position: "TE",
  nflTeam: "KC",
  injuryStatus: "ACTIVE",
  projectedPoints: 11.2,
  actualPoints: null,
  percentOwned: 0,
  percentStarted: 0,
  recentWeeks: [
    { week: 6, points: 8.4, opponent: "@LV" },
    { week: 5, points: null }, // bye
    { week: 4, points: 15.2, opponent: "BUF" },
    { week: 3, points: 9.1, opponent: "@NYG" },
    { week: 2, points: 25.1, opponent: "PHI" },
    { week: 1, points: 10.1, opponent: "@LAC" },
  ],
};

const freshPoison: FantasyPlayer = {
  ...mapped!,
  injuryStatus: "QUESTIONABLE",
  percentOwned: 98.5,
  percentStarted: 88,
  // If a future regression re-adds ESPN weeks, overlay must still ignore them.
  recentWeeks: [
    { week: 5, points: 19.1 },
    { week: 1, points: 12.7 },
  ],
  actualPoints: 12.7,
  projectedPoints: 99,
};

const overlaid = overlayEspnInjuryOwnership([dbPlayer], [freshPoison]);
assert.equal(overlaid.length, 1);
const out = overlaid[0]!;
assert.equal(out.injuryStatus, "QUESTIONABLE", "injury from ESPN overlay");
assert.equal(out.percentOwned, 98.5, "ownership from ESPN overlay");
assert.equal(out.percentStarted, 88);
assert.deepEqual(
  out.recentWeeks,
  dbPlayer.recentWeeks,
  "DB weeks must survive ESPN overlay",
);
assert.equal(out.actualPoints, null, "DB actualPoints preserved (null)");
assert.equal(
  out.projectedPoints,
  11.2,
  "DB/Sleeper projection preserved — ESPN proj not applied by overlay",
);

// New ESPN-only player enters without ESPN weeks.
const brandNew = overlayEspnInjuryOwnership(
  [],
  [
    {
      id: "espn-1",
      espnId: 1,
      name: "Newbie",
      position: "WR",
      nflTeam: "DAL",
      injuryStatus: "OUT",
      projectedPoints: 8,
      actualPoints: 5,
      percentOwned: 10,
      percentStarted: 1,
      recentWeeks: [{ week: 1, points: 5 }],
    },
  ],
);
assert.equal(brandNew[0]!.injuryStatus, "OUT");
assert.deepEqual(brandNew[0]!.recentWeeks, []);
assert.equal(brandNew[0]!.actualPoints, null);

console.log("verify-espn-public-no-actuals: ok");
