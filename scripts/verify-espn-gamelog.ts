/**
 * Regression: ESPN Postseason (and Preseason) weeks must never be treated as
 * regular-season actualPpr (issue #103).
 *
 * ESPN reuses week numbers across seasonTypes. Gap-fill upserts by week only
 * onto leagueId=""; if REG week N is missing but POST week N exists, playoff
 * PPR used to land in PlayerWeekStat as that REG week's actuals.
 *
 * Run: npm run verify:espn-gamelog
 */
import assert from "node:assert/strict";
import {
  isEspnRegularSeasonType,
  parseEspnGamelogPpr,
  type EspnGamelogJson,
} from "../src/lib/players/espn-gamelog";

// ── seasonType filter ────────────────────────────────────────────────────────
assert.equal(isEspnRegularSeasonType("2025 Regular Season"), true);
assert.equal(isEspnRegularSeasonType("2024 Regular Season"), true);
assert.equal(isEspnRegularSeasonType("2025 Postseason"), false);
assert.equal(isEspnRegularSeasonType("2025 Preseason"), false);
assert.equal(isEspnRegularSeasonType(undefined), false);
assert.equal(isEspnRegularSeasonType(""), false);
assert.equal(isEspnRegularSeasonType("Postseason"), false);

/**
 * Fixture shaped like live ESPN 2025 gamelog:
 * - Postseason weeks [2, 1] with distinctive PPR
 * - Preseason week [1] (also must not leak)
 * - Regular Season weeks [3, 1] — week 2 absent (DNP/injury gap)
 *
 * Stat columns: passingYards, passingTouchdowns, interceptions,
 * rushingYards, rushingTouchdowns, receptions, receivingYards,
 * receivingTouchdowns, fumblesLost
 *
 * Full PPR: passYds/25 + passTD×4 − INT×2 + rushYds/10 + rushTD×6
 *         + rec + recYds/10 + recTD×6 − FL×2
 */
const names = [
  "passingYards",
  "passingTouchdowns",
  "interceptions",
  "rushingYards",
  "rushingTouchdowns",
  "receptions",
  "receivingYards",
  "receivingTouchdowns",
  "fumblesLost",
];

/** 25 pass yds + 1 pass TD = 1 + 4 = 5.0 PPR */
const REG_WEEK1_STATS = ["25", "1", "0", "0", "0", "0", "0", "0", "0"];
/** Playoff: 250 pass yds + 3 TD = 10 + 12 = 22.0 — must NOT become REG week 2 */
const POST_WEEK2_STATS = ["250", "3", "0", "0", "0", "0", "0", "0", "0"];
/** Playoff week 1: 100 pass yds = 4.0 — must NOT overwrite / invent REG week 1 */
const POST_WEEK1_STATS = ["100", "0", "0", "0", "0", "0", "0", "0", "0"];
/** Preseason week 1: 75 pass yds = 3.0 — must not leak */
const PRE_WEEK1_STATS = ["75", "0", "0", "0", "0", "0", "0", "0", "0"];
/** REG week 3: 50 pass yds + 2 rush TD = 2 + 12 = 14.0 */
const REG_WEEK3_STATS = ["50", "0", "0", "0", "2", "0", "0", "0", "0"];

const fixture: EspnGamelogJson = {
  names,
  events: {
    "post-w2": {
      week: 2,
      atVs: "@",
      opponent: { abbreviation: "KC" },
    },
    "post-w1": {
      week: 1,
      atVs: "vs",
      opponent: { abbreviation: "BAL" },
    },
    "pre-w1": {
      week: 1,
      atVs: "vs",
      opponent: { abbreviation: "PIT" },
    },
    "reg-w3": {
      week: 3,
      atVs: "@",
      opponent: { abbreviation: "MIA" },
    },
    "reg-w1": {
      week: 1,
      atVs: "vs",
      opponent: { abbreviation: "NYJ" },
    },
  },
  seasonTypes: [
    {
      displayName: "2025 Postseason",
      categories: [
        {
          events: [
            { eventId: "post-w2", stats: POST_WEEK2_STATS },
            { eventId: "post-w1", stats: POST_WEEK1_STATS },
          ],
        },
      ],
    },
    {
      displayName: "2025 Preseason",
      categories: [
        {
          events: [{ eventId: "pre-w1", stats: PRE_WEEK1_STATS }],
        },
      ],
    },
    {
      displayName: "2025 Regular Season",
      categories: [
        {
          events: [
            { eventId: "reg-w3", stats: REG_WEEK3_STATS },
            { eventId: "reg-w1", stats: REG_WEEK1_STATS },
            // REG week 2 intentionally absent (DNP / injury)
          ],
        },
      ],
    },
  ],
};

const weeks = parseEspnGamelogPpr(fixture);
const byWeek = new Map(weeks.map((w) => [w.week, w]));

assert.equal(
  weeks.length,
  2,
  `expected only REG weeks 1 and 3, got ${weeks.map((w) => w.week).join(",")}`,
);
assert.ok(byWeek.has(1), "REG week 1 must still fill");
assert.ok(byWeek.has(3), "REG week 3 must still fill");
assert.equal(
  byWeek.has(2),
  false,
  "REG week 2 absent from gamelog must NOT receive Postseason week-2 PPR",
);

assert.equal(byWeek.get(1)!.actualPpr, 5);
assert.equal(byWeek.get(1)!.opponent, "NYJ");
assert.equal(byWeek.get(1)!.away, false);
assert.equal(byWeek.get(3)!.actualPpr, 14);
assert.equal(byWeek.get(3)!.opponent, "MIA");
assert.equal(byWeek.get(3)!.away, true);

// Simulate gap-fill candidate set: REG weeks 1–3 needed (week 2 is the poison case)
const needs = new Set([1, 2, 3]);
const wouldUpsert = weeks.filter((g) => needs.has(g.week));
assert.deepEqual(
  wouldUpsert.map((g) => g.week).sort((a, b) => a - b),
  [1, 3],
  "gap-fill must only upsert real REG weeks",
);
assert.ok(
  !wouldUpsert.some((g) => g.week === 2 && g.actualPpr === 22),
  "must never upsert playoff 22.0 into REG week 2",
);

// Unknown / missing seasonTypes → empty (safe; never invents weeks)
assert.deepEqual(parseEspnGamelogPpr({}), []);
assert.deepEqual(
  parseEspnGamelogPpr({
    names,
    events: fixture.events,
    seasonTypes: [{ displayName: "2025 Postseason", categories: fixture.seasonTypes![0].categories }],
  }),
  [],
  "Postseason-only payload must yield no REG weeks",
);

// #92 non-regression: empty categories still coerce to 0 today (do not change that here)
const emptyCats = parseEspnGamelogPpr({
  names,
  events: {
    "reg-empty": { week: 4, atVs: "vs", opponent: { abbreviation: "NE" } },
  },
  seasonTypes: [
    {
      displayName: "2025 Regular Season",
      categories: [
        {
          events: [
            {
              eventId: "reg-empty",
              stats: ["-", "-", "-", "-", "-", "-", "-", "-", "-"],
            },
          ],
        },
      ],
    },
  ],
});
assert.equal(emptyCats.length, 1);
assert.equal(
  emptyCats[0]!.actualPpr,
  0,
  "empty-category → 0 behavior unchanged (issue #92 is separate)",
);

console.log("verify-espn-gamelog: ok");
