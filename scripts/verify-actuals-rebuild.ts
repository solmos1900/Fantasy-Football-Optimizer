/**
 * Regression: versioned nflverse actuals rebuild (#136).
 * - Enabled by default; DATA_REBUILD_DISABLED kill-switch
 * - Force-rebuild week planner ignores the ≥25 coverage skip
 * - Cron wires runNflverseActualsRebuild; pool does not heavy-ingest
 * - Loader ignores espn_category actuals
 * - Fixture probes: Tetairoa McMillan (CAR) W4 = 45.2; 2-pt events counted
 *
 * Run: npm run verify:actuals-rebuild
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DATA_REBUILD_DISABLED_ENV,
  NFLVERSE_ACTUALS_DATA_VERSION,
  REBUILD_PROBE_MCMILLAN,
  resolveNflverseActualsRebuildMode,
  weeksNeedingForcedRebuild,
  completedWeeksForTarget,
  countTwoPointConversionEventsFromRows,
  mcmillanW4FromNflverseRows,
  formatRebuildHealthLog,
  type NflverseActualsVersionStamp,
  type RebuildHealthSnapshot,
} from "../src/lib/nflverse/actuals-rebuild";
import { fullPprFromNflverseRow } from "../src/lib/players/scoring";

assert.equal(
  resolveNflverseActualsRebuildMode({}),
  "apply",
  "default mode must be apply (merge = approval)",
);
assert.equal(
  resolveNflverseActualsRebuildMode({ [DATA_REBUILD_DISABLED_ENV]: "" }),
  "apply",
);
assert.equal(
  resolveNflverseActualsRebuildMode({ [DATA_REBUILD_DISABLED_ENV]: "1" }),
  "disabled",
);
assert.equal(
  resolveNflverseActualsRebuildMode({ [DATA_REBUILD_DISABLED_ENV]: "true" }),
  "disabled",
);
assert.ok(
  NFLVERSE_ACTUALS_DATA_VERSION >= 2,
  "data version must be ≥2 after #133/#134 scoring contract",
);

assert.deepEqual(
  weeksNeedingForcedRebuild(6, []),
  [1, 2, 3, 4, 5, 6],
  "empty progress → all weeks 1..N",
);
assert.deepEqual(
  weeksNeedingForcedRebuild(6, [1, 2, 3]),
  [4, 5, 6],
  "resume after partial apply",
);
assert.deepEqual(weeksNeedingForcedRebuild(6, [1, 2, 3, 4, 5, 6]), []);

const stampInProgress: NflverseActualsVersionStamp = {
  kind: "nflverse_actuals_version",
  appliedVersion: 0,
  workingTarget: NFLVERSE_ACTUALS_DATA_VERSION,
  completedWeeks: [1, 2],
  throughWeek: 6,
  lastRunAt: null,
  lastMode: "apply",
  lastSummary: null,
};
assert.deepEqual(
  completedWeeksForTarget(stampInProgress, NFLVERSE_ACTUALS_DATA_VERSION),
  [1, 2],
  "resume uses completedWeeks for matching workingTarget",
);
assert.deepEqual(
  completedWeeksForTarget(stampInProgress, NFLVERSE_ACTUALS_DATA_VERSION + 1),
  [],
  "new target clears progress",
);

// --- Fixture: McMillan W4 + 2-pt conversions (pure, no DB / network) ---
const fixtureRows: Array<Record<string, string>> = [
  {
    season_type: "REG",
    week: "4",
    position: "WR",
    player_display_name: "Tetairoa McMillan",
    team: "CAR",
    // 14 catches, 192 yds, 2 TD → full PPR 14+19.2+12 = 45.2
    fantasy_points_ppr: "45.2",
    receptions: "14",
    receiving_yards: "192",
    receiving_tds: "2",
    receiving_2pt_conversions: "0",
  },
  {
    season_type: "REG",
    week: "5",
    position: "QB",
    player_display_name: "Josh Allen",
    team: "BUF",
    // Published PPR includes the pass 2-pt; components omitted on purpose —
    // ingest prefers fantasy_points_ppr (#133).
    fantasy_points_ppr: "30.5",
    passing_2pt_conversions: "1",
    rushing_2pt_conversions: "0",
    receiving_2pt_conversions: "0",
  },
  {
    season_type: "REG",
    week: "3",
    position: "WR",
    player_display_name: "CeeDee Lamb",
    team: "DAL",
    fantasy_points_ppr: "20.2",
    receiving_2pt_conversions: "1",
  },
  {
    season_type: "REG",
    week: "6",
    position: "WR",
    player_display_name: "Drake London",
    team: "ATL",
    fantasy_points_ppr: "12.2",
    receiving_2pt_conversions: "1",
  },
  // Non-REG / out of range must not count
  {
    season_type: "POST",
    week: "1",
    position: "QB",
    player_display_name: "Playoff QB",
    team: "KC",
    passing_2pt_conversions: "9",
  },
];

const mcmPts = mcmillanW4FromNflverseRows(fixtureRows);
assert.equal(
  mcmPts,
  REBUILD_PROBE_MCMILLAN.expectedActualPpr,
  "Tetairoa McMillan (CAR) W4 fixture must be 45.2",
);
assert.equal(mcmPts, 45.2);

const twoPt = countTwoPointConversionEventsFromRows(fixtureRows, 6);
assert.equal(
  twoPt,
  3,
  "fixture must count Allen pass 2pt + Lamb rec 2pt + London rec 2pt (=3)",
);

// Scoring path used by ingest agrees with published fantasy_points_ppr.
assert.equal(
  fullPprFromNflverseRow(fixtureRows[0]!),
  45.2,
  "ingest scoring must prefer fantasy_points_ppr for McMillan W4",
);
assert.equal(fullPprFromNflverseRow(fixtureRows[1]!), 30.5);

const beforeSnap: RebuildHealthSnapshot = {
  week4NflverseRowCount: 34,
  mcmillanW4Points: 10.2, // polluted espn_category leftover
  twoPointConversionEvents: 3,
  throughWeek: 6,
  capturedAt: "2026-10-23T00:00:00.000Z",
};
const afterSnap: RebuildHealthSnapshot = {
  week4NflverseRowCount: 400,
  mcmillanW4Points: 45.2,
  twoPointConversionEvents: 3,
  throughWeek: 6,
  capturedAt: "2026-10-23T00:05:00.000Z",
};
const beforeLog = formatRebuildHealthLog("before", beforeSnap);
const afterLog = formatRebuildHealthLog("after", afterSnap);
assert.match(beforeLog, /week4NflverseRows=34/);
assert.match(beforeLog, /Tetairoa McMillan \(CAR\) W4=10\.2/);
assert.match(beforeLog, /twoPointConversionEvents=3/);
assert.match(afterLog, /week4NflverseRows=400/);
assert.match(afterLog, /Tetairoa McMillan \(CAR\) W4=45\.2/);
assert.match(afterLog, /twoPointConversionEvents=3/);

const cronSrc = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nflverse-usage/route.ts"),
  "utf8",
);
assert.match(cronSrc, /runNflverseActualsRebuild/);
assert.match(cronSrc, /backfillMissingNflverseWeeks/);
assert.match(cronSrc, /actualsRebuild/);

const poolSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/players/pool.ts"),
  "utf8",
);
assert.doesNotMatch(
  poolSrc,
  /backfillMissingNflverseWeeks/,
  "guest pool must not heavy-ingest on the request path (#136)",
);
assert.doesNotMatch(poolSrc, /ensureCompletedWeekIngest/);
assert.match(poolSrc, /findMissingNflverseWeeks/);
assert.match(
  poolSrc,
  /usableActual|actualSource === \"espn_category\"/,
  "loader must ignore espn_category actuals",
);

const rebuildSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/nflverse/actuals-rebuild.ts"),
  "utf8",
);
assert.match(rebuildSrc, /DATA_REBUILD_DISABLED/);
assert.match(rebuildSrc, /dry-run plan/);
assert.match(rebuildSrc, /formatRebuildHealthLog/);
assert.match(rebuildSrc, /Tetairoa McMillan/);

const helperSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/nflverse/backfill-missing-weeks.ts"),
  "utf8",
);
assert.match(helperSrc, /count < minCoverage/);

const pkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };
assert.ok(pkg.scripts["rebuild:nflverse-actuals"]);
assert.ok(pkg.scripts["verify:actuals-rebuild"]);
assert.ok(
  pkg.scripts["verify:live-stats-guest-week"],
  "must keep #140 script entry",
);

console.log("verify-actuals-rebuild: ok");
console.log(
  `  default=apply; kill-switch=${DATA_REBUILD_DISABLED_ENV}; McMillan W4=${mcmPts}; 2ptEvents=${twoPt}`,
);
