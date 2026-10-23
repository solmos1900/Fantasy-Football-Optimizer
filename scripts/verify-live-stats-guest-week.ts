/**
 * Regression for #138: guest (no-league) live stats must use the current NFL
 * week (same source as the player pool), not Week 1, and must not cap the
 * scoreboard at 12 games.
 *
 * Run: npm run verify:live-stats-guest-week
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getLiveStats } from "../src/lib/stats/provider";
import { fetchNflWeekSnapshot } from "../src/lib/players/week";
import { defaultEspnSeason } from "../src/lib/season";
import { fetchEspnScoreboard } from "../src/lib/espn/client";
import { parseEspnScoreboard } from "../src/lib/espn/scoreboard";

const providerSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/stats/provider.ts"),
  "utf8",
);

// Must resolve guest week via the shared NFL week snapshot — not `?? 1`.
assert.match(providerSrc, /fetchNflWeekSnapshot/);
assert.match(providerSrc, /defaultEspnSeason/);
assert.doesNotMatch(
  providerSrc,
  /league\?\.currentWeek\s*\?\?\s*1/,
  "guest path must not default currentWeek to 1",
);
assert.doesNotMatch(
  providerSrc,
  /games\.slice\(\s*0\s*,\s*12\s*\)/,
  "must not cap live games at 12",
);

async function main() {
  const season = defaultEspnSeason();
  const snap = await fetchNflWeekSnapshot(season);
  const live = await getLiveStats(null);

  assert.equal(
    live.week,
    snap.currentWeek,
    `guest live.week must match fetchNflWeekSnapshot (got ${live.week}, snap ${snap.currentWeek})`,
  );
  assert.ok(
    live.week >= 1 && live.week <= 22,
    `live.week out of range: ${live.week}`,
  );

  // Mid-season (after Week 1), guests must not be stuck on Week 1.
  if (snap.currentWeek > 1) {
    assert.notEqual(
      live.week,
      1,
      "guest live stats must not report Week 1 when the NFL is past Week 1",
    );
  }

  // Full slate: compare against an uncapped parse of the same week board.
  const raw = (await fetchEspnScoreboard(snap.currentWeek, season)) as {
    events?: Parameters<typeof parseEspnScoreboard>[0]["events"];
  };
  const { games: expected } = parseEspnScoreboard(raw);
  assert.equal(
    live.games.length,
    expected.length,
    `live games length ${live.games.length} must equal full parse ${expected.length}`,
  );
  assert.ok(
    live.games.length <= 16,
    `unexpected game count ${live.games.length}`,
  );
  // A typical mid-season week has more than 12 games; if ESPN returns that
  // many, prove we did not truncate to 12.
  if (expected.length > 12) {
    assert.ok(
      live.games.length > 12,
      "full week must not be truncated to 12 games",
    );
  }

  console.log("verify-live-stats-guest-week: ok", {
    week: live.week,
    season,
    games: live.games.length,
    sample: live.games.slice(0, 3).map((g) => ({
      away: g.away,
      home: g.home,
      awayScore: g.awayScore,
      homeScore: g.homeScore,
      status: g.status,
    })),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
