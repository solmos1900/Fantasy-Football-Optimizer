/**
 * Regression: Sleeper projection matching for players with null espn_id
 * and Jr/Sr/II–V name mismatches (issue #131).
 *
 * Confirms:
 * - Name normalization strips suffixes on both sides
 * - sleeperId lookup wins when provided
 * - All six UAT players resolve to Sleeper pts_ppr for the requested week
 *
 * Run: npm run verify:sleeper-proj-name-match
 */

import assert from "node:assert/strict";
import {
  fetchSleeperProjections,
  normalizeSleeperPlayerName,
  sleeperNameTeamKey,
  sleeperProjForPlayer,
} from "../src/lib/sleeper/projections";
import { defaultEspnSeason } from "../src/lib/season";

// --- Unit: name normalization ---
assert.equal(normalizeSleeperPlayerName("Kyle Pitts Sr."), "kyle pitts");
assert.equal(normalizeSleeperPlayerName("Kyle Pitts"), "kyle pitts");
assert.equal(normalizeSleeperPlayerName("KC Concepcion Jr."), "kc concepcion");
assert.equal(normalizeSleeperPlayerName("Brian Robinson Jr."), "brian robinson");
assert.equal(normalizeSleeperPlayerName("Pierre Strong Jr."), "pierre strong");
assert.equal(normalizeSleeperPlayerName("Erick All Jr."), "erick all");
assert.equal(normalizeSleeperPlayerName("Lew Nichols III"), "lew nichols");
assert.equal(normalizeSleeperPlayerName("Lew Nichols"), "lew nichols");
assert.equal(normalizeSleeperPlayerName("  D'Andre  Swift  "), "dandre swift");
assert.equal(
  sleeperNameTeamKey("Kyle Pitts Sr.", "ATL"),
  sleeperNameTeamKey("Kyle Pitts", "ATL"),
);
assert.equal(
  sleeperNameTeamKey("Lew Nichols III", "PIT"),
  sleeperNameTeamKey("Lew Nichols", "PIT"),
);

/** App-side names/teams from issue #131 (ESPN-style, no Sleeper suffixes). */
const ISSUE_PLAYERS: Array<{
  label: string;
  espnId: number;
  name: string;
  nflTeam: string;
  sleeperId: string;
  /** Approximate Week 7 pts from the bug report (sanity floor). */
  minPts: number;
}> = [
  {
    label: "Kyle Pitts (ATL)",
    espnId: 4362626,
    name: "Kyle Pitts",
    nflTeam: "ATL",
    sleeperId: "7553",
    minPts: 1,
  },
  {
    label: "KC Concepcion (CLE)",
    espnId: 0,
    name: "KC Concepcion",
    nflTeam: "CLE",
    sleeperId: "13298",
    minPts: 1,
  },
  {
    label: "Brian Robinson (ATL)",
    espnId: 0,
    name: "Brian Robinson",
    nflTeam: "ATL",
    sleeperId: "8154",
    minPts: 1,
  },
  {
    label: "Pierre Strong (GB)",
    espnId: 0,
    name: "Pierre Strong",
    nflTeam: "GB",
    sleeperId: "8116",
    minPts: 1,
  },
  {
    label: "Erick All (CIN)",
    espnId: 0,
    name: "Erick All",
    nflTeam: "CIN",
    sleeperId: "11592",
    minPts: 0.1,
  },
  {
    label: "Lew Nichols III (PIT)",
    espnId: 0,
    name: "Lew Nichols III",
    nflTeam: "PIT",
    sleeperId: "9510",
    minPts: 0.1,
  },
];

async function main() {
  const season = defaultEspnSeason();
  // Issue was filed against Week 7; prefer that week when the feed has data.
  const week = Number(process.env.VERIFY_SLEEPER_WEEK ?? 7);

  console.log(
    `verify:sleeper-proj-name-match — season ${season} week ${week}`,
  );

  const map = await fetchSleeperProjections({ season, week });
  assert.equal(map.emptyFeed, false, "Sleeper projection feed must be non-empty");
  assert.ok(map.bySleeperId.size > 0, "bySleeperId must be populated");
  assert.ok(map.byNameTeam.size > 0, "byNameTeam must be populated");

  const rows: Array<{
    player: string;
    viaSleeperId: number | null;
    viaNameTeam: number | null;
    feedPts: number | null;
  }> = [];

  for (const p of ISSUE_PLAYERS) {
    const feedPts = map.bySleeperId.get(p.sleeperId) ?? null;
    assert.ok(
      feedPts != null && Number.isFinite(feedPts),
      `${p.label}: Sleeper feed missing pts for sleeperId ${p.sleeperId}`,
    );
    assert.ok(
      feedPts! >= p.minPts,
      `${p.label}: expected pts >= ${p.minPts}, got ${feedPts}`,
    );

    // sleeperId path (preferred when Player.sleeperId is stored)
    const viaSleeperId = sleeperProjForPlayer(map, {
      espnId: p.espnId || 1,
      name: "WRONG NAME SHOULD NOT MATTER",
      nflTeam: "XX",
      sleeperId: p.sleeperId,
    });
    assert.equal(
      viaSleeperId,
      feedPts,
      `${p.label}: sleeperId lookup must equal feed pts`,
    );

    // name|team fallback (no sleeperId, null espn_id on Sleeper)
    const viaNameTeam = sleeperProjForPlayer(map, {
      espnId: p.espnId || 999_999_999,
      name: p.name,
      nflTeam: p.nflTeam,
    });
    assert.equal(
      viaNameTeam,
      feedPts,
      `${p.label}: name|team fallback must equal feed pts (got ${viaNameTeam})`,
    );

    rows.push({
      player: p.label,
      viaSleeperId,
      viaNameTeam,
      feedPts,
    });
  }

  console.table(rows);
  console.log(
    `OK — all ${ISSUE_PLAYERS.length} issue #131 players match via sleeperId and normalized name|team`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
