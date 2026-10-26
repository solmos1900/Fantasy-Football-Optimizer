/**
 * Unit guard: league scoring awareness (no network / DB).
 * - Reception scoring + superflex read from ESPN / Sleeper settings
 * - Projections read exactly the league's Sleeper field (no fallback)
 * - Superflex: QBs at full chip value, QB starters = 2, no QB-for-skill reject
 * - Copy names the league's scoring instead of "full PPR 1QB"
 * Run: npm run verify:league-scoring
 */

import assert from "node:assert/strict";
import {
  DEFAULT_SCORING,
  formatFromReceptionPoints,
  leagueScoring,
  scoringBoardLabel,
  scoringFromEspnSettings,
  type LeagueScoring,
} from "../src/lib/league/scoring";
import { ptsForFormatFromRow, ptsPprFromRow } from "../src/lib/sleeper/projections";
import {
  chipValue,
  isForbiddenOneForOne,
  needsPosition,
  starterNeed,
} from "../src/lib/insights/trade-value";
import { comparePlayerPackages } from "../src/lib/insights/trade-analyzer";
import type { FantasyPlayer, FantasyTeam } from "../src/lib/types";

// ── Format detection ──────────────────────────────────────────────────────
assert.equal(formatFromReceptionPoints(1), "ppr");
assert.equal(formatFromReceptionPoints(0.5), "half_ppr");
assert.equal(formatFromReceptionPoints(0), "std");
assert.equal(formatFromReceptionPoints(undefined), "std");

const espnHalfSf = scoringFromEspnSettings({
  scoringSettings: { scoringItems: [{ statId: 53, points: 0.5 }, { statId: 3, points: 0.04 }] },
  rosterSettings: { lineupSlotCounts: { "0": 1, "7": 1, "20": 7 } },
});
assert.deepEqual(espnHalfSf, {
  scoringFormat: "half_ppr",
  superflex: true,
  scoringLabel: "Half PPR · Superflex",
});
assert.equal(
  scoringFromEspnSettings({
    scoringSettings: { scoringItems: [{ statId: 53, points: 1 }] },
    rosterSettings: { lineupSlotCounts: { "0": 1, "7": 0 } },
  })?.scoringLabel,
  "Full PPR",
);
assert.equal(scoringFromEspnSettings({}), null); // unknown → caller keeps defaults

// Payloads saved before scoring support fall back to Full PPR, 1QB.
assert.deepEqual(leagueScoring({}), DEFAULT_SCORING);
assert.deepEqual(leagueScoring(null), DEFAULT_SCORING);
const halfSf: LeagueScoring = leagueScoring({
  scoringFormat: "half_ppr",
  superflex: true,
  scoringLabel: "Half PPR · Superflex",
});
assert.equal(scoringBoardLabel(DEFAULT_SCORING), "Full PPR, 1QB");
assert.equal(scoringBoardLabel(halfSf), "Half PPR, Superflex");

// ── Projections: exactly one field per format ─────────────────────────────
const row = { stats: { pts_ppr: 10.87, pts_half_ppr: 9.02, pts_std: 7.17 } };
assert.equal(ptsForFormatFromRow(row, "ppr"), ptsPprFromRow(row));
assert.equal(ptsForFormatFromRow(row, "half_ppr"), 9);
assert.equal(ptsForFormatFromRow(row, "std"), 7.2);
assert.equal(ptsForFormatFromRow({ stats: { pts_ppr: 12 } }, "half_ppr"), null);
assert.equal(ptsForFormatFromRow({ stats: { pts_half_ppr: 9 } }, "ppr"), null);

// ── Trade value ───────────────────────────────────────────────────────────
function player(
  id: number,
  position: FantasyPlayer["position"],
  ppg: number,
): FantasyPlayer {
  return {
    id: `espn-${id}`,
    espnId: id,
    name: `Player ${id}`,
    position,
    nflTeam: "KC",
    injuryStatus: "ACTIVE",
    projectedPoints: ppg,
    actualPoints: null,
    percentOwned: 0,
    percentStarted: 0,
    recentWeeks: [
      { week: 5, points: ppg },
      { week: 4, points: ppg },
    ],
  };
}

const qb = player(1, "QB", 22);
const wr = player(2, "WR", 16);

// 1QB discounts QBs; superflex values them at full price.
assert.ok(Math.abs(chipValue(qb) - 22 * 0.45) < 1e-9);
assert.ok(Math.abs(chipValue(qb, { scoring: halfSf }) - 22) < 1e-9);
assert.equal(chipValue(wr), chipValue(wr, { scoring: halfSf }));

// Naked QB-for-skill 1:1 is a hard reject only in 1QB.
assert.equal(isForbiddenOneForOne([qb], [wr]), true);
assert.equal(isForbiddenOneForOne([qb], [wr], halfSf), false);

// Superflex teams need two QB starters.
assert.equal(starterNeed("QB"), 1);
assert.equal(starterNeed("QB", halfSf), 2);
const oneQbTeam: FantasyTeam = {
  id: 1,
  name: "T",
  abbrev: "T",
  ownerName: "O",
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  standing: 1,
  roster: [qb],
};
assert.equal(needsPosition(oneQbTeam, "QB"), false);
assert.equal(needsPosition(oneQbTeam, "QB", halfSf), true);

// Analyzer: same QB-for-WR deal — hard reject in 1QB, graded in superflex.
const oneQb = comparePlayerPackages([wr], [qb]);
assert.equal(oneQb?.verdict, "hard_reject");
assert.match(oneQb!.summary, /1QB/);
assert.ok(oneQb!.facts.some((f) => f.includes("Full PPR, 1QB")));

const sf = comparePlayerPackages([wr], [qb], undefined, null, halfSf);
assert.ok(sf);
assert.notEqual(sf!.verdict, "hard_reject");
assert.ok(sf!.facts.some((f) => f.includes("Half PPR, Superflex")));
assert.doesNotMatch(JSON.stringify(sf), /1QB/);

console.log("verify-league-scoring: ok");
