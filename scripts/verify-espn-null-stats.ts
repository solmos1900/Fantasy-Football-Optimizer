/**
 * Regression: missing ESPN proj/actual must stay null (issue #75).
 * Real published 0.0 must remain 0 (do not regress #50).
 * Trends must skip unknown weeks, not treat them as goose eggs.
 *
 * Run: npx tsx scripts/verify-espn-null-stats.ts
 */
import assert from "node:assert/strict";
import { mapPlayer } from "../src/lib/espn/client";
import { finiteEspnAppliedTotal } from "../src/lib/espn/stats";
import { mapEspnPublicPlayer } from "../src/lib/players/espn-public";
import {
  deriveTrendFromWeeks,
  weekRowsForPlayer,
} from "../src/lib/insights/trends";
import type { FantasyPlayer } from "../src/lib/types";

// --- finiteEspnAppliedTotal ---
assert.equal(finiteEspnAppliedTotal(undefined), null);
assert.equal(finiteEspnAppliedTotal(null), null);
assert.equal(finiteEspnAppliedTotal("12"), null);
assert.equal(finiteEspnAppliedTotal(Number.NaN), null);
assert.equal(finiteEspnAppliedTotal(0), 0);
assert.equal(finiteEspnAppliedTotal(12.4), 12.4);

function baseEntry(stats: unknown[]): Record<string, unknown> {
  return {
    lineupSlotId: 2,
    playerPoolEntry: {
      player: {
        id: 4241457,
        fullName: "Test Player",
        defaultPositionId: 2,
        proTeamId: 1,
        injuryStatus: "ACTIVE",
        ownership: { percentOwned: 90, percentStarted: 80 },
        stats,
      },
    },
  };
}

const week = 5;

// Missing proj + actual blocks → null (not 0)
const missing = mapPlayer(baseEntry([]), week);
assert.equal(missing.projectedPoints, null, "missing proj must be null");
assert.equal(missing.actualPoints, null, "missing actual must be null");

// Present finite values map through
const present = mapPlayer(
  baseEntry([
    {
      scoringPeriodId: week,
      statSourceId: 1,
      statSplitTypeId: 1,
      appliedTotal: 14.2,
    },
    {
      scoringPeriodId: week,
      statSourceId: 0,
      statSplitTypeId: 1,
      appliedTotal: 9.6,
    },
  ]),
  week,
);
assert.equal(present.projectedPoints, 14.2);
assert.equal(present.actualPoints, 9.6);

// Real published 0.0 stays 0 (issue #50)
const realZero = mapPlayer(
  baseEntry([
    {
      scoringPeriodId: week,
      statSourceId: 1,
      statSplitTypeId: 1,
      appliedTotal: 0,
    },
    {
      scoringPeriodId: week,
      statSourceId: 0,
      statSplitTypeId: 1,
      appliedTotal: 0,
    },
  ]),
  week,
);
assert.equal(realZero.projectedPoints, 0);
assert.equal(realZero.actualPoints, 0);

// Projection-only past week must not invent points: 0
const projOnlyPast = mapPlayer(
  baseEntry([
    {
      scoringPeriodId: 4,
      statSourceId: 1,
      statSplitTypeId: 1,
      appliedTotal: 11.5,
    },
  ]),
  week,
);
assert.ok(projOnlyPast.recentWeeks?.length === 1);
assert.equal(projOnlyPast.recentWeeks![0].points, null);
assert.equal(projOnlyPast.recentWeeks![0].projectedPoints, 11.5);

// Public mapper mirrors the same contract
const publicMissing = mapEspnPublicPlayer(
  {
    id: 3918298,
    fullName: "Josh Allen",
    defaultPositionId: 1,
    proTeamId: 2,
    stats: [],
  },
  week,
);
assert.ok(publicMissing);
assert.equal(publicMissing!.projectedPoints, null);
assert.equal(publicMissing!.actualPoints, null);

const publicZero = mapEspnPublicPlayer(
  {
    id: 3918298,
    fullName: "Josh Allen",
    defaultPositionId: 1,
    proTeamId: 2,
    stats: [
      {
        scoringPeriodId: week,
        statSourceId: 1,
        statSplitTypeId: 1,
        appliedTotal: 0,
        stats: {},
      },
      {
        scoringPeriodId: week,
        statSourceId: 0,
        statSplitTypeId: 1,
        appliedTotal: 0,
        stats: {},
      },
    ],
  },
  week,
);
assert.ok(publicZero);
assert.equal(publicZero!.projectedPoints, 0);
assert.equal(publicZero!.actualPoints, 0);

// weekRowsForPlayer: null live fields stay null (unknown week)
const thinPlayer: FantasyPlayer = {
  id: "espn-1",
  espnId: 1,
  name: "Thin Sample",
  position: "WR",
  nflTeam: "KC",
  injuryStatus: "ACTIVE",
  projectedPoints: null,
  actualPoints: null,
  percentOwned: 50,
  percentStarted: 40,
  recentWeeks: [
    { week: 1, points: 12.0, projectedPoints: 11.0 },
    { week: 2, points: null, projectedPoints: 10.0 }, // unknown actual
    { week: 3, points: 0, projectedPoints: 9.0 }, // real duck
  ],
};
const rows = weekRowsForPlayer(thinPlayer, 4);
const byWeek = new Map(rows.map((r) => [r.week, r]));
assert.equal(byWeek.get(1)?.actualPpr, 12.0);
assert.equal(byWeek.get(2)?.actualPpr, null, "unknown week stays null");
assert.equal(byWeek.get(3)?.actualPpr, 0, "real 0.0 kept");
assert.equal(byWeek.get(4)?.actualPpr, null, "current missing stays null");
assert.equal(byWeek.get(4)?.projectedPpr, null);

// Trends skip unknown weeks; real 0 counts
const derived = deriveTrendFromWeeks(
  "Thin Sample",
  rows.map((r) => ({
    week: r.week,
    projectedPpr: r.projectedPpr,
    actualPpr: r.actualPpr,
  })),
);
assert.equal(
  derived.weeksSampled,
  2,
  `expected 2 sampled weeks (12 and 0), got ${derived.weeksSampled}`,
);
assert.equal(derived.avgActual, 6);

// Fake zeros would have sampled week 2+4 as well — guard the anti-pattern
const poisoned = deriveTrendFromWeeks("Poisoned", [
  { week: 1, projectedPpr: 11, actualPpr: 12 },
  { week: 2, projectedPpr: 10, actualPpr: 0 }, // fake zero from old bug
  { week: 3, projectedPpr: 9, actualPpr: 0 },
  { week: 4, projectedPpr: 0, actualPpr: 0 },
]);
assert.equal(poisoned.weeksSampled, 4);
assert.ok(
  (poisoned.avgActual ?? 99) < 4,
  "illustrates why fake zeros tank averages",
);

console.log("verify-espn-null-stats: ok");
