/**
 * Regression: Sleeper projections use full-PPR (`pts_ppr`) only (issue #87).
 *
 * Fails if:
 * - ptsPprFromRow falls back to half-PPR / standard when pts_ppr is absent
 * - Source in projections.ts still chains non-PPR Sleeper fields into the reader
 * - A missing pts_ppr would render as a numeric string (must be "—")
 *
 * Run: npm run verify:sleeper-ppr
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { dashNull } from "../src/lib/insights/format-null";
import {
  preferredProjOrNull,
  sleeperProjLine,
} from "../src/lib/insights/tool-display";
import { usableTradeProjection } from "../src/lib/insights/trade-value";
import { ptsPprFromRow } from "../src/lib/sleeper/projections";
import type { FantasyPlayer } from "../src/lib/types";

const projectionsSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/sleeper/projections.ts"),
  "utf8",
);

// --- Static guard: reader must not chain non-PPR Sleeper fields ---
const readerFn = projectionsSrc.match(
  /export function ptsPprFromRow[\s\S]*?\n\}/,
);
assert.ok(readerFn, "ptsPprFromRow export must exist for static scan");
assert.doesNotMatch(
  readerFn![0],
  /pts_half_ppr|pts_std|\.pts\b/,
  "ptsPprFromRow must not reference pts_half_ppr, pts_std, or standard pts",
);
assert.match(
  readerFn![0],
  /pts_ppr/,
  "ptsPprFromRow must read pts_ppr",
);
// Broader file: no ?? fallback onto half/standard in this module
assert.doesNotMatch(
  projectionsSrc,
  /pts_half_ppr\s*\?\?/,
  "projections.ts must not nullish-coalesce onto pts_half_ppr",
);
assert.doesNotMatch(
  projectionsSrc,
  /stats\?\.pts\s*\?\?/,
  "projections.ts must not nullish-coalesce onto stats.pts (standard)",
);
assert.doesNotMatch(
  projectionsSrc,
  /\?\?\s*row\.pts\b/,
  "projections.ts must not nullish-coalesce onto top-level standard pts",
);

// --- Unit: ptsPprFromRow ---
assert.equal(
  ptsPprFromRow({
    stats: { pts_ppr: 18.26, pts_half_ppr: 24, pts: 30 },
    pts_ppr: 21,
  }),
  18.3,
  "nested full-PPR takes precedence and rounds to one decimal",
);

assert.equal(
  ptsPprFromRow({
    stats: { pts_ppr: null, pts_half_ppr: 12, pts: 10 },
    pts_ppr: "15.46",
    pts_half_ppr: 13,
    pts: 11,
  }),
  15.5,
  "top-level full-PPR is used when nested pts_ppr is absent",
);

assert.equal(
  ptsPprFromRow({
    stats: { pts_ppr: "not-a-number", pts_half_ppr: 12 },
    pts_ppr: "7.27",
    pts: 10,
  }),
  7.3,
  "invalid nested pts_ppr may fall back only to top-level pts_ppr",
);

assert.equal(
  ptsPprFromRow({
    stats: { pts_ppr: 0, pts_half_ppr: 8, pts: 9 },
    pts_ppr: 10,
  }),
  0,
  "a real published 0.0 full-PPR projection is preserved",
);

assert.equal(
  ptsPprFromRow({
    stats: { pts_half_ppr: 12, pts: 10 },
    pts_half_ppr: 13,
    pts: 11,
  }),
  null,
  "half-PPR / standard alone must omit (null), never become a PPR number",
);

assert.equal(ptsPprFromRow(null), null);
assert.equal(ptsPprFromRow(undefined), null);
assert.equal(ptsPprFromRow({}), null);

// --- Display + downstream: missing pts_ppr is not a number ---
const missingOnlyHalf = ptsPprFromRow({
  stats: { pts_half_ppr: 14.5, pts: 11 },
});
assert.equal(missingOnlyHalf, null);

const display = dashNull(missingOnlyHalf);
assert.equal(display, "—", "missing pts_ppr must render as em dash, not a number");
assert.doesNotMatch(display, /^-?\d/, "dash display must not look numeric");

const player = {
  id: "espn-1",
  espnId: 1,
  name: "Test Player",
  position: "WR",
  nflTeam: "MIN",
  injuryStatus: "ACTIVE",
  // Pool overlay stores null when Sleeper pts_ppr is absent
  projectedPoints: null,
  actualPoints: null,
  percentOwned: 50,
  percentStarted: 40,
} satisfies FantasyPlayer;

const meta = {
  season: 2026,
  currentWeek: 7,
  statsThroughWeek: 6,
  weekAxis: [1, 2, 3, 4, 5, 6, 7],
  dvpByKey: {},
  sleeperByEspnId: {} as Record<string, number>,
  sleeperEmpty: false,
  maxPts: 20,
};

assert.equal(
  preferredProjOrNull(player, meta),
  null,
  "tool UI must treat missing Sleeper pts_ppr as null",
);
assert.equal(
  sleeperProjLine(preferredProjOrNull(player, meta)),
  "No projection this week",
);
assert.equal(
  usableTradeProjection(player),
  null,
  "trade math must treat missing projection as missing, not 0",
);

// Real zero stays numeric (OUT/IR sit), distinct from missing
assert.equal(dashNull(0), "0.0");
assert.equal(ptsPprFromRow({ stats: { pts_ppr: 0 } }), 0);

console.log("verify:sleeper-ppr: ok");
