/**
 * Golden accuracy gate for Insights / Who-to-Start / Trade inputs.
 *
 * Loads tests/fixtures/golden-players.json (nflverse full PPR).
 * Null expected fields = unknown (no stat row) — never compared as 0.
 *
 * mode "stub"   → schema validation only (exit 0)
 * mode "assert" → fail on non-null field mismatch vs PlayerWeekStat
 *
 * Run: npm run verify:golden
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  loadGoldenFixture,
  runGoldenAccuracyCheck,
} from "../src/lib/accuracy/golden-check";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "tests/fixtures/golden-players.json",
);

async function main() {
  assert.ok(fs.existsSync(FIXTURE_PATH), `Missing fixture at ${FIXTURE_PATH}`);
  const fixture = loadGoldenFixture();

  assert.ok(fixture.version >= 1, "fixture.version must be >= 1");
  assert.ok(
    fixture.mode === "stub" || fixture.mode === "assert",
    'fixture.mode must be "stub" or "assert"',
  );
  assert.ok(Array.isArray(fixture.players) && fixture.players.length > 0);

  for (const p of fixture.players) {
    assert.ok(p.espnId > 0, `espnId required (${p.name})`);
    assert.ok(p.name?.trim(), `name required (${p.espnId})`);
    assert.ok(Array.isArray(p.expected?.weeks), `${p.name}: weeks`);
  }

  console.log(
    JSON.stringify(
      {
        fixture: FIXTURE_PATH,
        mode: fixture.mode,
        season: fixture.season,
        players: fixture.players.length,
        scoring: "full_ppr_nflverse",
      },
      null,
      2,
    ),
  );

  if (fixture.mode === "stub") {
    console.log(
      "golden stub OK — structure valid; set mode=assert after filling expected.*",
    );
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("verify:golden mode=assert requires DATABASE_URL");
  }

  const result = await runGoldenAccuracyCheck();
  if (!result.ok) {
    console.error("golden mismatches:");
    for (const f of result.failures) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `golden assert OK — ${result.playersChecked} players match nflverse full-PPR fixture`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
