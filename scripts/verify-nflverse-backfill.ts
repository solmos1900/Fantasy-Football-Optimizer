/**
 * Regression: weeks 1..N must be backfill candidates when coverage is thin
 * (#126). Cron owns the helper; the guest pool only notices gaps (#136).
 *
 * Optional live check (DATABASE_URL): golden fixture players have W1–W6
 * nflverse actuals and Lamar / Trevor Lawrence are trade-selectable.
 *
 * Run: npm run verify:nflverse-backfill
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import {
  weeksNeedingBackfill,
  NFLVERSE_WEEK_MIN_COVERAGE,
} from "../src/lib/nflverse/backfill-missing-weeks";

// Pure: missing early weeks are selected; solid weeks skipped.
const coverage = new Map<number, number>([
  [1, 0],
  [2, 0],
  [3, 10], // below threshold
  [4, 0],
  [5, 300],
  [6, 290],
]);
const need = weeksNeedingBackfill(6, coverage, NFLVERSE_WEEK_MIN_COVERAGE);
assert.deepEqual(need, [1, 2, 3, 4], "W1–W4 need backfill; W5–W6 solid");

assert.deepEqual(
  weeksNeedingBackfill(0, new Map()),
  [],
  "no weeks when throughWeek < 1",
);
assert.deepEqual(
  weeksNeedingBackfill(3, new Map([[1, 100], [2, 100], [3, 100]])),
  [],
  "all covered → nothing to ingest",
);

// Source guards: cron uses the backfill helper; pool notices gaps only (no
// heavy ingest on the request path). Pool no longer caps at 500.
const poolSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/players/pool.ts"),
  "utf8",
);
assert.match(poolSrc, /findMissingNflverseWeeks/);
assert.doesNotMatch(
  poolSrc,
  /backfillMissingNflverseWeeks/,
  "pool must not call backfillMissingNflverseWeeks (#136 request-path timeout)",
);
assert.doesNotMatch(
  poolSrc,
  /take:\s*500/,
  "loadPlayersFromDb must not cap at 500 players",
);

const cronSrc = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nflverse-usage/route.ts"),
  "utf8",
);
assert.match(cronSrc, /backfillMissingNflverseWeeks/);
assert.match(cronSrc, /runNflverseActualsRebuild/);

const helperSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/nflverse/backfill-missing-weeks.ts"),
  "utf8",
);
assert.match(helperSrc, /weeksNeedingBackfill/);
assert.match(helperSrc, /actualSource:\s*"nflverse_ppr"/);

console.log("verify-nflverse-backfill: pure checks ok");

async function liveChecks() {
  if (!process.env.DATABASE_URL) {
    console.log(
      "verify-nflverse-backfill: skip live (no DATABASE_URL) — pure checks passed",
    );
    return;
  }

  const { getNoLeaguePlayerPool } = await import("../src/lib/players/pool");
  const { isTradeSelectablePlayer } = await import(
    "../src/lib/insights/trade-eligibility"
  );
  const golden = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "tests/fixtures/golden-players.json"),
      "utf8",
    ),
  ) as {
    season: number;
    players: Array<{
      espnId: number;
      name: string;
      expected: { weeks: Array<{ week: number; actualPpr: number | null }> };
    }>;
  };

  console.log("verify-nflverse-backfill: loading pool (may backfill)…");
  const pool = await getNoLeaguePlayerPool({ forceRefresh: true });
  assert.ok(
    pool.freshness.statsThroughWeek >= 6,
    `expected statsThroughWeek >= 6, got ${pool.freshness.statsThroughWeek}`,
  );

  // Sample golden fixture players only (Josh Allen is not in the fixture).
  const sampleNames = ["Joe Burrow", "Ja'Marr Chase", "Bijan Robinson"];
  for (const name of sampleNames) {
    const fixture = golden.players.find((p) => p.name === name);
    assert.ok(fixture, `golden fixture missing ${name}`);
    const player = pool.players.find((p) => p.espnId === fixture!.espnId);
    assert.ok(player, `${name} missing from pool`);
    const byWeek = new Map(
      (player!.recentWeeks ?? []).map((w) => [w.week, w.points]),
    );
    for (const w of fixture!.expected.weeks) {
      if (w.week > 6) continue;
      if (w.actualPpr == null) continue;
      const pts = byWeek.get(w.week);
      assert.ok(
        typeof pts === "number" && Number.isFinite(pts),
        `${name} missing W${w.week} actual in pool (golden has ${w.actualPpr})`,
      );
    }
    console.log(`  golden ${name}: W1–W6 present`);
  }

  const LAMAR = 3916387; // Lamar Jackson (BAL) — nflverse players.csv
  const TREVOR = 4360310; // Trevor Lawrence (JAX)
  const lamar = pool.players.find((p) => p.espnId === LAMAR);
  const trevor = pool.players.find((p) => p.espnId === TREVOR);
  assert.ok(lamar, "Lamar Jackson missing from pool");
  assert.ok(trevor, "Trevor Lawrence missing from pool");
  assert.ok(
    isTradeSelectablePlayer(lamar!),
    "Lamar Jackson must be trade-eligible after backfill + uncapped load",
  );
  assert.ok(
    isTradeSelectablePlayer(trevor!),
    "Trevor Lawrence must be trade-eligible after backfill + uncapped load",
  );
  assert.ok(
    (lamar!.recentWeeks ?? []).some(
      (w) => typeof w.points === "number" && Number.isFinite(w.points),
    ),
    "Lamar must have completed-week points",
  );
  assert.ok(
    (trevor!.recentWeeks ?? []).some(
      (w) => typeof w.points === "number" && Number.isFinite(w.points),
    ),
    "Trevor must have completed-week points",
  );
  console.log("  Lamar Jackson + Trevor Lawrence: trade-eligible");
}

liveChecks()
  .then(() => {
    console.log("verify-nflverse-backfill: ok");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { prisma } = await import("../src/lib/db");
      await prisma.$disconnect();
    } catch {
      // ignore when live path skipped
    }
  });
