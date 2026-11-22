/**
 * Unit guard: this week's actual stays unknown (—), not 0.0, until the
 * player's NFL game kicks off. Sleeper reports 0 for every rostered player
 * before kickoff and on bye weeks. Real 0.0 in a started/finished game stays.
 * Run: npm run verify:unplayed-actuals
 */

import assert from "node:assert/strict";
import { enrichLeagueOpponents, parseEspnScoreboard } from "../src/lib/espn/scoreboard";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";

const ev = (id: string, home: string, away: string, state: "pre" | "in" | "post") => ({
  id,
  status: { type: { state } },
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: "0", team: { abbreviation: home } },
        { homeAway: "away", score: "0", team: { abbreviation: away } },
      ],
    },
  ],
});

const parsed = parseEspnScoreboard({
  events: [ev("1", "BUF", "MIA", "pre"), ev("2", "HOU", "IND", "post"), ev("3", "KC", "ARI", "in")],
});
assert.equal(parsed.stateByTeam.get("BUF"), "scheduled");
assert.equal(parsed.stateByTeam.get("IND"), "final");
assert.equal(parsed.stateByTeam.get("ARI"), "in_progress");

const p = (espnId: number, nflTeam: string, actualPoints: number | null): FantasyPlayer => ({
  id: `espn-${espnId}`,
  espnId,
  name: `P${espnId}`,
  position: "WR",
  nflTeam,
  injuryStatus: "ACTIVE",
  projectedPoints: 10,
  actualPoints,
  percentOwned: 0,
  percentStarted: 0,
});

const league: LeagueData = {
  leagueId: "t",
  season: 2026,
  name: "T",
  currentWeek: 11,
  scoringPeriodId: 11,
  isDemo: false,
  matchups: [],
  lastSyncedAt: new Date().toISOString(),
  teams: [
    {
      id: 1, name: "A", abbrev: "A", ownerName: "o", wins: 0, losses: 0, ties: 0,
      pointsFor: 0, pointsAgainst: 0, standing: 1,
      roster: [
        p(1, "BUF", 0), // pre-game 0 → unknown
        p(2, "HOU", 0), // finished game, real 0.0 → kept
        p(3, "KC", 0), // in progress 0 → kept (live)
        p(4, "SEA", 0), // SEA not on the board → bye → unknown
        p(5, "HOU", 20.5), // real score untouched
        p(6, "FA", 0), // free agent, no team → untouched
      ],
    },
  ],
  freeAgents: [p(7, "MIA", 0)],
};

const out = enrichLeagueOpponents(league, parsed);
const byId = new Map(out.teams[0]!.roster.map((x) => [x.espnId, x]));
assert.equal(byId.get(1)!.actualPoints, null, "pre-kickoff 0 → —");
assert.equal(byId.get(1)!.opponent, "vs MIA");
assert.equal(byId.get(2)!.actualPoints, 0, "final 0.0 kept");
assert.equal(byId.get(3)!.actualPoints, 0, "live 0.0 kept");
assert.equal(byId.get(4)!.actualPoints, null, "bye 0 → —");
assert.equal(byId.get(4)!.opponent, "BYE");
assert.equal(byId.get(5)!.actualPoints, 20.5);
assert.equal(byId.get(6)!.actualPoints, 0);
assert.equal(out.freeAgents[0]!.actualPoints, null, "free agents too");

// No scoreboard events (offseason / fetch failed) → nothing changes.
const empty = enrichLeagueOpponents(league, parseEspnScoreboard({ events: [] }));
assert.equal(empty.teams[0]!.roster[0]!.actualPoints, 0);

console.log("verify:unplayed-actuals OK");
