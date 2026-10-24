/**
 * Regression: past-week opponents must use the player's historical NFL team
 * for that week when known (issue #106).
 *
 * Covers:
 * 1. mapPlayer captures per-week nflTeam from ESPN stats[].proTeamId
 * 2. Traded player — earlier week opponent comes from the old club
 * 3. Missing per-week team — falls back to current FantasyPlayer.nflTeam
 *    (fixes blank opponents for non-traded players)
 * 4. Blank opponent when both per-week and current team are unknown / FA
 * 5. Non-traded player with week.nflTeam === current still enriches
 *
 * Run: npx tsx scripts/verify-past-week-opponent-team.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mapPlayer } from "../src/lib/espn/client";
import {
  enrichRecentWeekOpponents,
  historicalTeamForRecentWeek,
  type NflScheduleEntry,
} from "../src/lib/espn/scoreboard";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";

// ── historicalTeamForRecentWeek ──────────────────────────────────────
assert.equal(
  historicalTeamForRecentWeek({ nflTeam: "SF" }, "KC"),
  "SF",
  "per-week team wins over current",
);
assert.equal(
  historicalTeamForRecentWeek({ nflTeam: "was" }, "KC"),
  "WSH",
);
assert.equal(
  historicalTeamForRecentWeek({ nflTeam: "FA" }, "KC"),
  "KC",
  "FA week team falls back to current",
);
assert.equal(
  historicalTeamForRecentWeek({}, "KC"),
  "KC",
  "missing per-week team falls back to current (no blank for stable players)",
);
assert.equal(
  historicalTeamForRecentWeek({}, "FA"),
  undefined,
  "FA current with no per-week team stays unknown",
);
assert.equal(
  historicalTeamForRecentWeek({}),
  undefined,
  "no teams at all → unknown",
);

// ── mapPlayer: per-week proTeamId → recentWeeks[].nflTeam ────────────
// ESPN: 25 = SF, 12 = KC. Player currently on KC; week 3 actual was SF.
const tradedEntry: Record<string, unknown> = {
  lineupSlotId: 4,
  playerPoolEntry: {
    player: {
      id: 4241457,
      fullName: "Traded WR",
      defaultPositionId: 3,
      proTeamId: 12, // current = KC
      injuryStatus: "ACTIVE",
      ownership: { percentOwned: 80, percentStarted: 70 },
      stats: [
        {
          scoringPeriodId: 3,
          statSourceId: 0,
          statSplitTypeId: 1,
          proTeamId: 25, // historical = SF
          appliedTotal: 14.2,
        },
        {
          scoringPeriodId: 3,
          statSourceId: 1,
          statSplitTypeId: 1,
          proTeamId: 25,
          appliedTotal: 12.0,
        },
        {
          scoringPeriodId: 4,
          statSourceId: 0,
          statSplitTypeId: 1,
          proTeamId: 12, // after trade = KC
          appliedTotal: 9.1,
        },
        {
          scoringPeriodId: 5,
          statSourceId: 1,
          statSplitTypeId: 1,
          proTeamId: 12,
          appliedTotal: 11.0,
        },
      ],
    },
  },
};

const mapped = mapPlayer(tradedEntry, 5);
assert.equal(mapped.nflTeam, "KC", "top-level current club");
const week3 = mapped.recentWeeks?.find((w) => w.week === 3);
const week4 = mapped.recentWeeks?.find((w) => w.week === 4);
assert.ok(week3, "week 3 recent row");
assert.equal(week3!.nflTeam, "SF", "week 3 must keep SF from stats.proTeamId");
assert.equal(week3!.points, 14.2);
assert.equal(week4!.nflTeam, "KC", "week 4 after trade uses KC");

// Projection-only past week still captures proTeamId when present
const projOnly = mapPlayer(
  {
    lineupSlotId: 2,
    playerPoolEntry: {
      player: {
        id: 1,
        fullName: "Proj Only",
        defaultPositionId: 2,
        proTeamId: 12,
        ownership: {},
        stats: [
          {
            scoringPeriodId: 2,
            statSourceId: 1,
            statSplitTypeId: 1,
            proTeamId: 25,
            appliedTotal: 8.5,
          },
        ],
      },
    },
  },
  5,
);
assert.equal(projOnly.recentWeeks?.[0]?.nflTeam, "SF");
assert.equal(projOnly.recentWeeks?.[0]?.points, null);

// proTeamId 0 on the week row → leave nflTeam unset (enricher may fall back)
const zeroTeamWeek = mapPlayer(
  {
    lineupSlotId: 2,
    playerPoolEntry: {
      player: {
        id: 2,
        fullName: "Zero Week Team",
        defaultPositionId: 2,
        proTeamId: 12,
        ownership: {},
        stats: [
          {
            scoringPeriodId: 3,
            statSourceId: 0,
            statSplitTypeId: 1,
            proTeamId: 0,
            appliedTotal: 5,
          },
        ],
      },
    },
  },
  5,
);
assert.equal(
  zeroTeamWeek.recentWeeks?.[0]?.nflTeam,
  undefined,
  "proTeamId 0 must not invent a week nflTeam",
);

function weekSchedule(
  entries: Array<[string, NflScheduleEntry]>,
): Map<string, NflScheduleEntry> {
  return new Map(entries);
}

/** Week 3: SF @ SEA, KC vs DEN, PHI @ DAL. */
const week3Sched = weekSchedule([
  ["SF", { kind: "game", opponent: "SEA", home: false }],
  ["SEA", { kind: "game", opponent: "SF", home: true }],
  ["KC", { kind: "game", opponent: "DEN", home: true }],
  ["DEN", { kind: "game", opponent: "KC", home: false }],
  ["PHI", { kind: "game", opponent: "DAL", home: false }],
  ["DAL", { kind: "game", opponent: "PHI", home: true }],
]);

const schedules = new Map<number, Map<string, NflScheduleEntry>>([
  [3, week3Sched],
]);

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

// ── Traded: old club's week-3 opponent (from mapPlayer → enrich) ─────
const tradedMapped = mapPlayer(tradedEntry, 5);
const tradedOut = enrichRecentWeekOpponents(
  leagueWith([tradedMapped]),
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

// End-to-end without mapPlayer: explicit week.nflTeam still preferred
const tradedExplicit = basePlayer({
  espnId: 101,
  name: "Traded WR Explicit",
  nflTeam: "KC",
  recentWeeks: [{ week: 3, points: 14.2, nflTeam: "SF" }],
});
assert.equal(
  week3Opponent(
    enrichRecentWeekOpponents(leagueWith([tradedExplicit]), schedules).teams[0]
      .roster[0],
  ),
  "@SEA",
);

// ── Missing per-week team → fall back to current (no blank) ──────────
const missingHistory = basePlayer({
  espnId: 102,
  name: "Stable Missing History",
  nflTeam: "KC",
  recentWeeks: [{ week: 3, points: 14.2 }],
});
assert.equal(
  week3Opponent(
    enrichRecentWeekOpponents(leagueWith([missingHistory]), schedules).teams[0]
      .roster[0],
  ),
  "vs DEN",
  "without per-week team, fall back to current club so opponent is not blank",
);

// ── Blank opponent: FA / unknown current and no per-week team ────────
const blankCase = basePlayer({
  espnId: 103,
  name: "Released FA",
  nflTeam: "FA",
  recentWeeks: [{ week: 3, points: 8.1 }],
});
assert.equal(
  week3Opponent(
    enrichRecentWeekOpponents(leagueWith([blankCase]), schedules).teams[0]
      .roster[0],
  ),
  undefined,
  "FA with no per-week team must leave opponent blank (not invent a matchup)",
);

// Existing opponent labels are preserved
const alreadySet = basePlayer({
  espnId: 104,
  name: "Already Labeled",
  nflTeam: "KC",
  recentWeeks: [{ week: 3, points: 9.0, opponent: "@SEA" }],
});
assert.equal(
  week3Opponent(
    enrichRecentWeekOpponents(leagueWith([alreadySet]), schedules).teams[0]
      .roster[0],
  ),
  "@SEA",
);

// ── Non-traded: week.nflTeam === current → normal enrichment ─────────
const stable = basePlayer({
  espnId: 105,
  name: "Stable WR",
  nflTeam: "PHI",
  recentWeeks: [{ week: 3, points: 11.5, nflTeam: "PHI" }],
});
assert.equal(
  week3Opponent(
    enrichRecentWeekOpponents(leagueWith([stable]), schedules).teams[0]
      .roster[0],
  ),
  "@DAL",
);

// Free agents follow the same rules
const faTraded = basePlayer({
  espnId: 106,
  name: "FA Traded",
  nflTeam: "DEN",
  recentWeeks: [{ week: 3, points: 6.0, nflTeam: "SF" }],
});
const faLeague = leagueWith([]);
faLeague.freeAgents = [faTraded];
assert.equal(
  week3Opponent(enrichRecentWeekOpponents(faLeague, schedules).freeAgents[0]),
  "@SEA",
);

// Guard: enrich must prefer historicalTeamForRecentWeek (with current fallback)
const scoreboardSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/espn/scoreboard.ts"),
  "utf8",
);
const enrichStart = scoreboardSrc.indexOf(
  "export function enrichRecentWeekOpponents",
);
assert.ok(enrichStart >= 0);
const enrichFn = scoreboardSrc.slice(enrichStart, enrichStart + 2400);
assert.match(
  enrichFn,
  /historicalTeamForRecentWeek\(\s*w\s*,\s*player\.nflTeam\s*\)/,
  "enrichRecentWeekOpponents must resolve team via historicalTeamForRecentWeek(w, player.nflTeam)",
);
assert.doesNotMatch(
  enrichFn,
  /formatOpponentLabel\(\s*player\.nflTeam/,
  "must not call formatOpponentLabel(player.nflTeam) directly",
);

const clientSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/espn/client.ts"),
  "utf8",
);
assert.match(
  clientSrc,
  /nflTeamFromWeekStat|stat\.proTeamId/,
  "mapPlayer must read per-week proTeamId",
);

console.log("verify-past-week-opponent-team: ok");
