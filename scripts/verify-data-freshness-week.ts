/**
 * Unit guard: /api/health/data-freshness grades the latest completed week,
 * not an in-progress week that already has a few rows (false ok:false).
 * Run: npm run verify:data-freshness-week
 */

import assert from "node:assert/strict";
import { freshnessWeekToAssess } from "../src/lib/accuracy/data-freshness";
import { minutesAgoLabel } from "../src/lib/players/pool";

// Sunday of Week 7: Thursday's game ingested (DB=7), Week 6 is the last done.
assert.equal(freshnessWeekToAssess(7, 6), 6);
// Tuesday after MNF: both agree.
assert.equal(freshnessWeekToAssess(7, 7), 7);
// DB behind the scoreboard: still grade the completed week (shows stale).
assert.equal(freshnessWeekToAssess(5, 6), 6);
// Scoreboard unavailable: fall back to what the DB has.
assert.equal(freshnessWeekToAssess(7, null), 7);
assert.equal(freshnessWeekToAssess(null, null), null);
// Preseason / week 0 from the scoreboard: use the DB.
assert.equal(freshnessWeekToAssess(null, 0), null);

// "Updated …" ages read in sensible units (never "39673 min ago").
const ago = (mins: number) => minutesAgoLabel(new Date(Date.now() - mins * 60_000).toISOString());
assert.equal(ago(0), "just now");
assert.equal(ago(1), "1 min ago");
assert.equal(ago(45), "45 min ago");
assert.equal(ago(60), "1 hr ago");
assert.equal(ago(5 * 60), "5 hr ago");
assert.equal(ago(24 * 60), "1 day ago");
assert.equal(ago(39673), "28 days ago");
assert.equal(minutesAgoLabel(null), null);

console.log("verify-data-freshness-week: ok");
