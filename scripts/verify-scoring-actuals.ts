/**
 * Regression: full-PPR actuals match nflverse fantasy_points_ppr (#127).
 *
 * Golden rows (2026 REG):
 *   Joe Burrow W3      = 22.58  (sack_fumbles_lost = 1)
 *   Josh Allen W5      = 30.5   (passing_2pt_conversions = 1)
 *   Michael Penix W6   = 23.1   (passing 2pt = 2, sack fumble lost = 1)
 *   2-pt conversion    = Josh Allen W5 components (+2)
 *   Special-teams TD   = Myles Price W3 = 6.0 (special_teams_tds = 1)
 *
 * Also asserts ESPN_STAT 2-pt / fumbles-lost mapping and that QB gamelogs
 * without a fumblesLost column do not invent PPR.
 *
 * Run: npm run verify:scoring-actuals
 */
import assert from "node:assert/strict";
import {
  ESPN_STAT,
  fullPprFromCategories,
  fullPprFromEspnStatMap,
  fullPprFromNflverseRow,
} from "../src/lib/players/scoring";
import {
  parseEspnGamelogPpr,
  type EspnGamelogJson,
} from "../src/lib/players/espn-gamelog";

const TOL = 0.001;

function assertPpr(
  label: string,
  got: number | null,
  expected: number,
): void {
  assert.ok(got != null, `${label}: expected ${expected}, got null`);
  assert.ok(
    Math.abs(got - expected) <= TOL,
    `${label}: expected ${expected}, got ${got}`,
  );
}

// ── Golden: Burrow W3 (sack fumble lost) ─────────────────────────────────────
const burrowW3 = {
  player_display_name: "Joe Burrow",
  week: "3",
  passing_yards: "282",
  passing_tds: "3",
  passing_interceptions: "0",
  rushing_yards: "13",
  rushing_tds: "0",
  receptions: "0",
  receiving_yards: "0",
  receiving_tds: "0",
  passing_2pt_conversions: "0",
  rushing_2pt_conversions: "0",
  receiving_2pt_conversions: "0",
  sack_fumbles_lost: "1",
  rushing_fumbles_lost: "0",
  receiving_fumbles_lost: "0",
  special_teams_tds: "0",
  fumble_recovery_tds: "0",
  fantasy_points_ppr: "22.58",
};
assertPpr("Burrow W3 nflverse", fullPprFromNflverseRow(burrowW3), 22.58);
assertPpr(
  "Burrow W3 components",
  fullPprFromCategories({
    passYards: 282,
    passTd: 3,
    interceptions: 0,
    rushYards: 13,
    rushTd: 0,
    fumblesLost: 1,
  }),
  22.58,
);

// ── Golden: Allen W5 (passing 2pt) ───────────────────────────────────────────
const allenW5 = {
  player_display_name: "Josh Allen",
  week: "5",
  passing_yards: "210",
  passing_tds: "1",
  passing_interceptions: "1",
  rushing_yards: "121",
  rushing_tds: "1",
  receptions: "0",
  receiving_yards: "0",
  receiving_tds: "0",
  passing_2pt_conversions: "1",
  rushing_2pt_conversions: "0",
  receiving_2pt_conversions: "0",
  sack_fumbles_lost: "0",
  rushing_fumbles_lost: "0",
  receiving_fumbles_lost: "0",
  special_teams_tds: "0",
  fumble_recovery_tds: "0",
  fantasy_points_ppr: "30.5",
};
assertPpr("Allen W5 nflverse", fullPprFromNflverseRow(allenW5), 30.5);
assertPpr(
  "Allen W5 components (2pt case)",
  fullPprFromCategories({
    passYards: 210,
    passTd: 1,
    interceptions: 1,
    rushYards: 121,
    rushTd: 1,
    pass2pt: 1,
  }),
  30.5,
);
// Without 2pt the old formula was low by exactly 2.
assertPpr(
  "Allen W5 without 2pt (legacy miss)",
  fullPprFromCategories({
    passYards: 210,
    passTd: 1,
    interceptions: 1,
    rushYards: 121,
    rushTd: 1,
  }),
  28.5,
);

// ── Golden: Penix W6 (two 2pt + sack fumble lost) ────────────────────────────
const penixW6 = {
  player_display_name: "Michael Penix Jr.",
  week: "6",
  passing_yards: "225",
  passing_tds: "3",
  passing_interceptions: "0",
  rushing_yards: "1",
  rushing_tds: "0",
  receptions: "0",
  receiving_yards: "0",
  receiving_tds: "0",
  passing_2pt_conversions: "2",
  rushing_2pt_conversions: "0",
  receiving_2pt_conversions: "0",
  sack_fumbles_lost: "1",
  rushing_fumbles_lost: "0",
  receiving_fumbles_lost: "0",
  special_teams_tds: "0",
  fumble_recovery_tds: "0",
  fantasy_points_ppr: "23.1",
};
assertPpr("Penix W6 nflverse", fullPprFromNflverseRow(penixW6), 23.1);
assertPpr(
  "Penix W6 components",
  fullPprFromCategories({
    passYards: 225,
    passTd: 3,
    rushYards: 1,
    pass2pt: 2,
    fumblesLost: 1,
  }),
  23.1,
);

// ── Special-teams TD case (Myles Price W3) ───────────────────────────────────
const priceW3 = {
  player_display_name: "Myles Price",
  week: "3",
  passing_yards: "0",
  passing_tds: "0",
  passing_interceptions: "0",
  rushing_yards: "0",
  rushing_tds: "0",
  receptions: "0",
  receiving_yards: "0",
  receiving_tds: "0",
  passing_2pt_conversions: "0",
  rushing_2pt_conversions: "0",
  receiving_2pt_conversions: "0",
  sack_fumbles_lost: "0",
  rushing_fumbles_lost: "0",
  receiving_fumbles_lost: "0",
  special_teams_tds: "1",
  fumble_recovery_tds: "0",
  fantasy_points_ppr: "6",
};
assertPpr("Price W3 ST TD nflverse", fullPprFromNflverseRow(priceW3), 6);
assertPpr(
  "Price W3 ST TD components",
  fullPprFromCategories({ specialTeamsTd: 1 }),
  6,
);

// Prefer published fantasy_points_ppr over a divergent component rebuild.
assertPpr(
  "published wins over wrong components",
  fullPprFromNflverseRow({
    player_display_name: "Fixture",
    week: "1",
    fantasy_points_ppr: "22.58",
    // Deliberately incomplete components — must not override published.
    passing_yards: "282",
    passing_tds: "3",
  }),
  22.58,
);

// ── ESPN_STAT mapping: 2pt + fumbles-lost ────────────────────────────────────
assert.equal(ESPN_STAT.pass2pt, "19");
assert.equal(ESPN_STAT.rush2pt, "26");
assert.equal(ESPN_STAT.rec2pt, "44");
assert.equal(ESPN_STAT.fumblesLost, "72");
assert.equal(ESPN_STAT.fumblesLostPass, "69");
assert.equal(ESPN_STAT.fumblesLostRush, "70");
assert.equal(ESPN_STAT.fumblesLostRec, "71");

assertPpr(
  "ESPN map: pass 2pt + FL",
  fullPprFromEspnStatMap({
    "3": 210, // pass yards
    "4": 1, // pass TD
    "19": 1, // pass 2pt
    "20": 1, // INT
    "24": 121, // rush yards
    "25": 1, // rush TD
    "72": 0,
  }),
  30.5,
);

assertPpr(
  "ESPN map: component fumbles-lost ids when 72 absent",
  fullPprFromEspnStatMap({
    "3": 282,
    "4": 3,
    "24": 13,
    "69": 1, // passing fumbles lost (sack)
  }),
  22.58,
);

// ── ESPN gamelog: no fumblesLost column → no invented PPR (QB line) ──────────
const qbNoFl: EspnGamelogJson = {
  names: [
    "passingYards",
    "passingTouchdowns",
    "interceptions",
    "rushingYards",
    "rushingTouchdowns",
  ],
  events: {
    "reg-w3": {
      week: 3,
      atVs: "@",
      opponent: { abbreviation: "PIT" },
    },
  },
  seasonTypes: [
    {
      displayName: "2026 Regular Season",
      categories: [
        {
          events: [
            {
              eventId: "reg-w3",
              // Would be 24.58 if FL invented as 0 (Burrow W3 bug).
              stats: ["282", "3", "0", "13", "0"],
            },
          ],
        },
      ],
    },
  ],
};
assert.deepEqual(
  parseEspnGamelogPpr(qbNoFl),
  [],
  "QB gamelog without fumblesLost must not invent actualPpr",
);

// Present fumblesLost column with a real lost fumble still scores correctly.
const withFl: EspnGamelogJson = {
  names: [
    "passingYards",
    "passingTouchdowns",
    "interceptions",
    "rushingYards",
    "rushingTouchdowns",
    "receptions",
    "receivingYards",
    "receivingTouchdowns",
    "fumblesLost",
  ],
  events: {
    "reg-w3": { week: 3, atVs: "@", opponent: { abbreviation: "PIT" } },
  },
  seasonTypes: [
    {
      displayName: "2026 Regular Season",
      categories: [
        {
          events: [
            {
              eventId: "reg-w3",
              stats: ["282", "3", "0", "13", "0", "0", "0", "0", "1"],
            },
          ],
        },
      ],
    },
  ],
};
const withFlWeeks = parseEspnGamelogPpr(withFl);
assert.equal(withFlWeeks.length, 1);
assertPpr("gamelog with FL=1", withFlWeeks[0]!.actualPpr, 22.58);

console.log("verify-scoring-actuals: ok");
console.log(
  JSON.stringify(
    {
      burrowW3: 22.58,
      allenW5: 30.5,
      penixW6: 23.1,
      specialTeamsTd: 6,
      twoPointCase: "Allen W5 passing_2pt_conversions=1",
    },
    null,
    2,
  ),
);
