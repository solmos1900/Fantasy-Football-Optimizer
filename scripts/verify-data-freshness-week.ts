/**
 * Unit guard: /api/health/data-freshness grades the latest completed week,
 * not an in-progress week that already has a few rows (false ok:false).
 * Run: npm run verify:data-freshness-week
 */

import assert from "node:assert/strict";
import { freshnessWeekToAssess } from "../src/lib/accuracy/data-freshness";

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

console.log("verify-data-freshness-week: ok");
