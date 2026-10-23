/**
 * Regression: past-week opponents must use the player's historical NFL team
 * for that week, never FantasyPlayer.nflTeam (issue #106).
 *
 * Covers:
 * 1. Traded player — earlier week opponent comes from the old club
 * 2. Missing historical team — opponent stays unknown (no current-team guess)
 * 3. Non-traded player — same enrichment as before when week.nflTeam === current
 *
 * Run: npx tsx scripts/verify-past-week-opponent-team.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  enrichRecentWeekOpponents,
  historicalTeamForRecentWeek,
  type NflScheduleEntry,
  type RecentWeekWithHistoricalTeam,
} from "../src/lib/espn/scoreboard";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";

// ── historicalTeamForRecentWeek ──────────────────────────────────────
assert.equal(
  historicalTeamForRecentWeek({ week: 1, points: 10, nflTeam: "SF" }),
  "SF",
);
assert.equal(
  historicalTeamForRecentWeek({ week: 1, points: 10, nflTeam: "was" }),
  "WSH",
);
assert.equal(
  historicalTeamForRecentWeek({ week: 1, points: 10, nflTeam: "FA" }),
  undefined,
);
assert.equal(
  historicalTeamForRecentWeek({ week: 1, points: 10 }),
  undefined,
  "missing historical team must be unknown",
);

function weekSchedule(
  entries: Array<[string, NflScheduleEntry]>,
): Map<string, NflScheduleEntry> {
  return new Map(entries);
}

/** Week 3: SF @ SEA, KC vs DEN, PHI @ DAL. No BYE invented for absent clubs. */
const week3 = weekSchedule([
  ["SF", { kind: "game", opponent: "SEA", home: false }],
  ["SEA", { kind: "game", opponent: "SF", home: true }],
  ["KC", { kind: "game", opponent: "DEN", home: true }],
  ["DEN", { kind: "game", opponent: "KC", home: false }],
  ["PHI", { kind: "game", opponent: "DAL", home: false }],
  ["DAL", { kind: "game", opponent: "PHI", home: true }],
]);

const schedules = new Map<number, Map<string, NflScheduleEntry>>([[3, week3]]);

function basePlayer(
  partial: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "name" | "nflTeam" | "recentWeeks">,
): FantasyPlayer {
  return {
    id: `espn-${partial.espnId ?? 1}`,
    espnId: partial.espnId ?? 1,
    name: partial.name,
    position: partial.position ?? "WR",
    nflTeam: partial.nflTeam,
    injuryStatus: "ACTIVE",
    projectedPoints: 12,
    actualPoints: null,
    percentOwned: 50,
    percentStarted: 40,
    recentWeeks: partial.recentWeeks,
  };
}

function leagueWith(roster: FantasyPlayer[]): LeagueData {
  return {
    leagueId: "test",
    season: 2026,
    name: "Test",
    currentWeek: 5,
    scoringPeriodId: 5,
    isDemo: false,
    teams: [
      {
        id: 1,
        name: "A",
        abbrev: "A",
        ownerName: "A",
        wins: 2,
        losses: 2,
        ties: 0,
        pointsFor: 400,
        pointsAgainst: 380,
        standing: 1,
        roster,
        isCurrentUser: true,
      },
    ],
    matchups: [],
    freeAgents: [],
    lastSyncedAt: new Date().toISOString(),
    userTeamId: 1,
  };
}

function week3Opponent(player: FantasyPlayer): string | undefined {
  return player.recentWeeks?.find((w) => w.week === 3)?.opponent;
}

// ── 1. Traded player: old club's week-3 opponent, not the new club's ─
// Player was on SF in week 3, now on KC. SF played @SEA; KC played vs DEN.
const traded = basePlayer({
  espnId: 101,
  name: "Traded WR",
  nflTeam: "KC",
  recentWeeks: [
    {
      week: 3,
      points: 14.2,
      nflTeam: "SF",
    } as RecentWeekWithHistoricalTeam,
  ],
});

const tradedOut = enrichRecentWeekOpponents(
  leagueWith([traded]),
  schedules,
).teams[0].roster[0];

assert.equal(
  week3Opponent(tradedOut),
  "@SEA",
  "traded player week-3 opponent must come from SF (old club), not KC",
);
assert.notEqual(
  week3Opponent(tradedOut),
  "vs DEN",
  "must not use current club KC's week-3 opponent",
);

// Same player WITHOUT historical team must not invent KC's opponent
const tradedNoHistory = basePlayer({
  espnId: 102,
  name: "Traded WR No History",
  nflTeam: "KC",
  recentWeeks: [{ week: 3, points: 14.2 }],
});
const tradedNoHistoryOut = enrichRecentWeekOpponents(
  leagueWith([tradedNoHistory]),
  schedules,
).teams[0].roster[0];
assert.equal(
  week3Opponent(tradedNoHistoryOut),
  undefined,
  "without historical team, must leave opponent unknown (not KC vs DEN)",
);

// ── 2. Missing historical team → unknown (never current team / BYE) ─
const missingTeam = basePlayer({
  espnId: 103,
  name: "Unknown History",
  // Current team is on bye relative to week3 board if we wrongly used it
  // with scheduleMapWithByes — here the raw week3 map has no PHI bye entry,
  // but PHI is on the board. Use a club absent from week3 so a current-team
  // fallback would incorrectly invent nothing from this map — still wrong
  // direction. Stronger: current = KC would fill "vs DEN".
  nflTeam: "KC",
  recentWeeks: [{ week: 3, points: 8.1 }],
});
const missingOut = enrichRecentWeekOpponents(
  leagueWith([missingTeam]),
  schedules,
).teams[0].roster[0];
assert.equal(
  week3Opponent(missingOut),
  undefined,
  "missing historical team must not fall back to current nflTeam",
);

// Existing opponent labels are preserved regardless of team
const alreadySet = basePlayer({
  espnId: 104,
  name: "Already Labeled",
  nflTeam: "KC",
  recentWeeks: [{ week: 3, points: 9.0, opponent: "@SEA" }],
});
const alreadyOut = enrichRecentWeekOpponents(
  leagueWith([alreadySet]),
  schedules,
).teams[0].roster[0];
assert.equal(week3Opponent(alreadyOut), "@SEA");

// ── 3. Non-traded: week.nflTeam === current → same as pre-fix behavior ─
const stable = basePlayer({
  espnId: 105,
  name: "Stable WR",
  nflTeam: "PHI",
  recentWeeks: [
    {
      week: 3,
      points: 11.5,
      nflTeam: "PHI",
    } as RecentWeekWithHistoricalTeam,
  ],
});
const stableOut = enrichRecentWeekOpponents(
  leagueWith([stable]),
  schedules,
).teams[0].roster[0];
assert.equal(
  week3Opponent(stableOut),
  "@DAL",
  "non-traded player with historical team === current must enrich normally",
);

// Free agents follow the same rules
const faTraded = basePlayer({
  espnId: 106,
  name: "FA Traded",
  nflTeam: "DEN",
  recentWeeks: [
    {
      week: 3,
      points: 6.0,
      nflTeam: "SF",
    } as RecentWeekWithHistoricalTeam,
  ],
});
const faLeague = leagueWith([]);
faLeague.freeAgents = [faTraded];
const faOut = enrichRecentWeekOpponents(faLeague, schedules).freeAgents[0];
assert.equal(
  week3Opponent(faOut),
  "@SEA",
  "FA traded player must also use historical club",
);

// Guard: enrichRecentWeekOpponents must not look up the current club
const scoreboardSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/espn/scoreboard.ts"),
  "utf8",
);
const enrichStart = scoreboardSrc.indexOf(
  "export function enrichRecentWeekOpponents",
);
assert.ok(enrichStart >= 0, "enrichRecentWeekOpponents must exist");
const enrichFn = scoreboardSrc.slice(enrichStart, enrichStart + 2200);
assert.doesNotMatch(
  enrichFn,
  /formatOpponentLabel\(\s*player\.nflTeam/,
  "enrichRecentWeekOpponents must not pass player.nflTeam to formatOpponentLabel",
);
assert.match(
  enrichFn,
  /historicalTeamForRecentWeek/,
  "enrichRecentWeekOpponents must resolve historical team per week",
);

console.log("verify-past-week-opponent-team: ok");
