/**
 * Regression guard for issue #74:
 * Incomplete ESPN recentWeeks / scaffolded null weeks must not wipe
 * previously stored actualPpr / projectedPpr on trend refresh upserts.
 *
 * Run: npm run verify:trend-null-wipe
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  scaffoldWeekAxis,
  shouldPersistWeekStat,
  weekRowsForPlayer,
  weekStatScoreUpdateFields,
} from "../src/lib/insights/trends";
import type { FantasyPlayer } from "../src/lib/types";

function basePlayer(over: Partial<FantasyPlayer> = {}): FantasyPlayer {
  return {
    id: "p1",
    espnId: 1001,
    name: "Test Back",
    position: "RB",
    nflTeam: "MIN",
    injuryStatus: "ACTIVE",
    projectedPoints: 12.4,
    actualPoints: 0,
    percentOwned: 90,
    percentStarted: 70,
    ...over,
  };
}

// ── scaffold fills missing weeks with nulls (display axis) ──────────
const scaffolded = scaffoldWeekAxis(4, [
  { week: 1, projectedPpr: 14.1, actualPpr: 18.2 },
  { week: 3, projectedPpr: 13.0, actualPpr: 9.5 },
]);
assert.equal(scaffolded.length, 4);
assert.deepEqual(scaffolded[1], {
  week: 2,
  projectedPpr: null,
  actualPpr: null,
});
assert.equal(scaffolded[0]!.actualPpr, 18.2);
assert.equal(scaffolded[2]!.actualPpr, 9.5);

// ── incomplete recentWeeks → weekRowsForPlayer still scaffolds nulls ─
const incomplete = weekRowsForPlayer(
  basePlayer({
    // ESPN only returned the current week; prior weeks absent from payload
    recentWeeks: [{ week: 4, points: 11.2, projectedPoints: 12.4, opponent: "CHI" }],
    projectedPoints: 12.4,
    actualPoints: 11.2,
    opponent: "CHI",
  }),
  4,
);
assert.equal(incomplete.length, 4);
assert.equal(incomplete[0]!.projectedPpr, null);
assert.equal(incomplete[0]!.actualPpr, null);
assert.equal(incomplete[1]!.projectedPpr, null);
assert.equal(incomplete[1]!.actualPpr, null);
assert.equal(incomplete[2]!.projectedPpr, null);
assert.equal(incomplete[2]!.actualPpr, null);
assert.equal(incomplete[3]!.actualPpr, 11.2);
assert.equal(incomplete[3]!.projectedPpr, 12.4);

// ── null/null placeholders must not be persisted ────────────────────
assert.equal(shouldPersistWeekStat(null, null), false);
assert.equal(shouldPersistWeekStat(12.4, null), true);
assert.equal(shouldPersistWeekStat(null, 9.1), true);
assert.equal(shouldPersistWeekStat(0, null), true); // real 0.0 proj (#50)
assert.equal(shouldPersistWeekStat(null, 0), true); // real 0.0 actual (#50)
assert.equal(shouldPersistWeekStat(10, 8), true);

for (const row of incomplete) {
  if (row.week < 4) {
    assert.equal(
      shouldPersistWeekStat(row.projectedPpr, row.actualPpr),
      false,
      `scaffolded week ${row.week} must be skipped on persist`,
    );
  } else {
    assert.equal(
      shouldPersistWeekStat(row.projectedPpr, row.actualPpr),
      true,
      "current week with scores must persist",
    );
  }
}

// ── update payload omits null score fields (preserves DB values) ────
const wipeWouldHaveBeen = weekStatScoreUpdateFields({
  projectedPpr: null,
  actualPpr: null,
  projectionSource: "espn",
  actualSource: null,
});
assert.deepEqual(
  wipeWouldHaveBeen,
  {},
  "null/null must not set actualPpr or projectedPpr on update",
);
assert.equal("actualPpr" in wipeWouldHaveBeen, false);
assert.equal("projectedPpr" in wipeWouldHaveBeen, false);

const partialProjOnly = weekStatScoreUpdateFields({
  projectedPpr: 15.5,
  actualPpr: null,
  projectionSource: "espn",
  actualSource: null,
});
assert.equal(partialProjOnly.projectedPpr, 15.5);
assert.equal(partialProjOnly.projectionSource, "espn");
assert.equal("actualPpr" in partialProjOnly, false);
assert.equal("actualSource" in partialProjOnly, false);
assert.equal("projectionDelta" in partialProjOnly, false);

const partialActualOnly = weekStatScoreUpdateFields({
  projectedPpr: null,
  actualPpr: 22.3,
  projectionSource: "espn",
  actualSource: "espn_league",
});
assert.equal(partialActualOnly.actualPpr, 22.3);
assert.equal(partialActualOnly.actualSource, "espn_league");
assert.equal("projectedPpr" in partialActualOnly, false);
assert.equal("projectionDelta" in partialActualOnly, false);

const both = weekStatScoreUpdateFields({
  projectedPpr: 14,
  actualPpr: 18,
  projectionSource: "espn",
  actualSource: "espn_league",
});
assert.equal(both.projectedPpr, 14);
assert.equal(both.actualPpr, 18);
assert.equal(both.projectionDelta, 4);
assert.equal(both.projectionSource, "espn");
assert.equal(both.actualSource, "espn_league");

// True 0.0 must still be written (distinct from null wipe / #50)
const zeroActual = weekStatScoreUpdateFields({
  projectedPpr: 10,
  actualPpr: 0,
  projectionSource: "espn",
  actualSource: "espn_league",
});
assert.equal(zeroActual.actualPpr, 0);
assert.equal(zeroActual.projectionDelta, -10);

const zeroProj = weekStatScoreUpdateFields({
  projectedPpr: 0,
  actualPpr: null,
  projectionSource: "espn",
  actualSource: null,
});
assert.equal(zeroProj.projectedPpr, 0);
assert.equal("actualPpr" in zeroProj, false);

// ── source guards: refresh upsert must use the helpers ──────────────
const trendsSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/insights/trends.ts"),
  "utf8",
);
assert.match(trendsSrc, /shouldPersistWeekStat/);
assert.match(trendsSrc, /weekStatScoreUpdateFields/);
assert.match(
  trendsSrc,
  /if\s*\(\s*!shouldPersistWeekStat\(projected,\s*row\.actualPpr\)\s*\)/,
);
// Ban the pre-#74 wipe pattern: update unconditionally wrote both score fields.
const refreshFn = trendsSrc.slice(
  trendsSrc.indexOf("export async function refreshProjectionTrends"),
  trendsSrc.indexOf("snapshots += 1"),
);
const updateStart = refreshFn.lastIndexOf("update: {");
assert.ok(updateStart >= 0, "refreshProjectionTrends must have an upsert update block");
const updateBlock = refreshFn.slice(updateStart);
assert.match(updateBlock, /\.\.\.weekStatScoreUpdateFields\(/);
assert.doesNotMatch(
  updateBlock,
  /scoringFormat:\s*"PPR",\s*\n\s*projectedPpr:\s*projected,\s*\n\s*actualPpr:\s*row\.actualPpr/,
  "update must not unconditionally assign projectedPpr + actualPpr (null-wipe path)",
);

console.log("verify-trend-null-wipe: ok");
