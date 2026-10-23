/**
 * Regression: versioned nflverse actuals rebuild (#136).
 * - Mode defaults to off
 * - Force-rebuild week planner ignores the ≥25 coverage skip
 * - Cron wires runNflverseActualsRebuild; pool does not heavy-ingest
 * - Loader ignores espn_category actuals
 *
 * Run: npm run verify:actuals-rebuild
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  NFLVERSE_ACTUALS_DATA_VERSION,
  resolveNflverseActualsRebuildMode,
  weeksNeedingForcedRebuild,
  completedWeeksForTarget,
  type NflverseActualsVersionStamp,
} from "../src/lib/nflverse/actuals-rebuild";

assert.equal(
  resolveNflverseActualsRebuildMode({}),
  "off",
  "default mode must be off",
);
assert.equal(
  resolveNflverseActualsRebuildMode({ NFLVERSE_ACTUALS_REBUILD_MODE: "" }),
  "off",
);
assert.equal(
  resolveNflverseActualsRebuildMode({
    NFLVERSE_ACTUALS_REBUILD_MODE: "dry-run",
  }),
  "dry-run",
);
assert.equal(
  resolveNflverseActualsRebuildMode({
    NFLVERSE_ACTUALS_REBUILD_MODE: "apply",
  }),
  "apply",
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

const cronSrc = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nflverse-usage/route.ts"),
  "utf8",
);
assert.match(cronSrc, /runNflverseActualsRebuild/);
assert.match(cronSrc, /backfillMissingNflverseWeeks/);
assert.match(cronSrc, /NFLVERSE_ACTUALS_REBUILD_MODE|actualsRebuild/);

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
assert.match(poolSrc, /espn_category/);
assert.match(
  poolSrc,
  /usableActual|actualSource === \"espn_category\"/,
  "loader must ignore espn_category actuals",
);

const helperSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/nflverse/backfill-missing-weeks.ts"),
  "utf8",
);
assert.match(helperSrc, /weeksNeedingBackfill/);
assert.match(
  helperSrc,
  /count < minCoverage/,
  "coverage backfill still skips solid weeks (force path is separate)",
);

const pkg = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
) as { scripts: Record<string, string> };
assert.ok(
  pkg.scripts["rebuild:nflverse-actuals"],
  "package.json must expose rebuild:nflverse-actuals",
);
assert.ok(pkg.scripts["verify:actuals-rebuild"]);

console.log("verify-actuals-rebuild: ok");
console.log(
  `  mode default=off; dataVersion=${NFLVERSE_ACTUALS_DATA_VERSION}; force weeks planner + cron wiring checked`,
);
