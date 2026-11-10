/**
 * Synthetic data for the chat eval. Every player is FICTIONAL (made-up names,
 * ESPN ids 9000xx, stat lines that don't exist in the real world) so the
 * model cannot answer from memory: any number it states must come from a
 * tool result, or it is a hallucination.
 *
 * Two contexts mirror production (src/lib/chat/player-resolve.ts):
 * - noLeague: guest / no connected league (my_roster, league_teams gated)
 * - league: connected league, user owns "Gridiron Gang"
 */

import type { ChatDataContext } from "../../src/lib/chat/player-resolve";
import type { ToolDisplayMeta } from "../../src/lib/insights/tool-display";
import type { PlayerPoolFreshness } from "../../src/lib/players/pool";
import type {
  FantasyPlayer,
  FantasyTeam,
  InjuryStatus,
  LeagueData,
  PlayerPosition,
} from "../../src/lib/types";

export const EVAL_SEASON = 2026;
export const EVAL_CURRENT_WEEK = 11;
export const EVAL_STATS_THROUGH = 10;

type Spec = {
  espnId: number;
  name: string;
  position: PlayerPosition;
  nflTeam: string;
  opponent: string;
  /** Sleeper projection this week (null = not published). */
  proj: number | null;
  /** Weeks 1..10 points; null entries = did not play (bye / injury). */
  weeks: (number | null)[];
  injury?: InjuryStatus;
};

const SPECS: Spec[] = [
  // QBs
  { espnId: 900101, name: "Dorian Kessler", position: "QB", nflTeam: "KC", opponent: "DEN", proj: 21.7, weeks: [18.4, 24.1, 16.9, 27.3, null, 22.6, 19.8, 25.2, 14.7, 23.9] },
  { espnId: 900102, name: "Tavian Marsh", position: "QB", nflTeam: "SEA", opponent: "ARI", proj: 17.3, weeks: [12.6, 15.2, 19.4, 11.8, 16.7, null, 13.9, 21.1, 17.5, 14.3] },
  { espnId: 900103, name: "Colby Varnes", position: "QB", nflTeam: "NYJ", opponent: "MIA", proj: 15.8, weeks: [9.7, 14.6, 18.2, 13.1, 10.4, 16.9, null, 12.2, 15.5, 11.6] },
  { espnId: 900104, name: "Rashaun Pryor", position: "QB", nflTeam: "TB", opponent: "CAR", proj: 19.4, weeks: [20.3, 17.6, null, 23.8, 18.1, 21.4, 16.2, 19.9, 24.6, 20.7] },
  // RBs
  { espnId: 900201, name: "Marcus Vell", position: "RB", nflTeam: "ATL", opponent: "NO", proj: 16.9, weeks: [14.2, 21.7, 11.3, 18.6, 23.1, null, 15.8, 19.4, 12.7, 17.9] },
  { espnId: 900202, name: "Jalen Brooksby", position: "RB", nflTeam: "DET", opponent: "GB", proj: 13.4, weeks: [8.3, 12.9, 17.4, 9.6, 14.1, 11.2, null, 13.8, 10.5, 15.3] },
  { espnId: 900203, name: "Quincy Harlow", position: "RB", nflTeam: "LAR", opponent: "SF", proj: 11.2, weeks: [6.4, 9.1, 13.6, 7.8, 12.3, 10.9, 8.2, null, 11.7, 9.4] },
  { espnId: 900204, name: "Desmond Okafor", position: "RB", nflTeam: "BAL", opponent: "PIT", proj: 18.6, weeks: [19.7, 16.3, 22.8, 15.4, null, 24.2, 17.6, 20.1, 18.9, 21.5] },
  { espnId: 900205, name: "Tyrell Gaines", position: "RB", nflTeam: "HOU", opponent: "IND", proj: 9.8, weeks: [4.6, 7.2, 11.9, 5.3, 8.7, 6.1, 10.4, null, 7.9, 12.6], injury: "QUESTIONABLE" },
  { espnId: 900206, name: "Bryce Lindqvist", position: "RB", nflTeam: "CHI", opponent: "MIN", proj: 7.6, weeks: [2.3, 4.8, 3.1, 9.4, 6.2, null, 11.8, 13.4, 12.1, 14.9] },
  { espnId: 900207, name: "Nico Albright", position: "RB", nflTeam: "BUF", opponent: "NE", proj: 0, weeks: [12.8, 15.1, 9.7, 13.3, 10.6, 14.4, null, 8.9, null, null], injury: "OUT" },
  // WRs
  { espnId: 900301, name: "Kendrick Sato", position: "WR", nflTeam: "CIN", opponent: "CLE", proj: 17.8, weeks: [22.4, 13.7, 19.2, 26.1, 15.9, null, 21.3, 17.6, 24.8, 18.2] },
  { espnId: 900302, name: "Emory Blackwood", position: "WR", nflTeam: "MIN", opponent: "CHI", proj: 14.9, weeks: [11.6, 18.3, 9.4, 16.7, 13.2, 20.5, null, 12.1, 15.8, 14.4] },
  { espnId: 900303, name: "Lucan Ferreira", position: "WR", nflTeam: "DAL", opponent: "PHI", proj: 12.7, weeks: [8.9, 15.4, 11.2, 7.6, 14.8, 10.3, 13.7, null, 9.1, 16.2] },
  { espnId: 900304, name: "Isaiah Montrose", position: "WR", nflTeam: "LAC", opponent: "LV", proj: 15.6, weeks: [16.2, 12.8, 19.7, 14.3, null, 17.9, 13.4, 18.6, 15.1, 20.4] },
  { espnId: 900305, name: "Theo Quarles", position: "WR", nflTeam: "SF", opponent: "LAR", proj: 10.4, weeks: [5.7, 8.2, 12.6, 6.9, 9.8, 7.3, 11.4, 10.1, null, 13.8] },
  { espnId: 900306, name: "Darnell Upshaw", position: "WR", nflTeam: "PHI", opponent: "DAL", proj: 13.3, weeks: [14.7, 10.2, 16.8, 9.5, 13.9, 15.6, null, 11.3, 17.2, 12.4] },
  { espnId: 900307, name: "Rowan Pierce", position: "WR", nflTeam: "GB", opponent: "DET", proj: 8.7, weeks: [3.4, 6.8, 4.2, 9.1, 5.5, 7.7, null, 2.9, 10.6, 8.3], injury: "DOUBTFUL" },
  { espnId: 900308, name: "Cyrus Delacroix", position: "WR", nflTeam: "MIA", opponent: "NYJ", proj: 11.9, weeks: [null, null, null, null, 7.4, 13.6, 10.9, 15.2, 12.8, 14.1] },
  // TEs
  { espnId: 900401, name: "Garrett Lindell", position: "TE", nflTeam: "KC", opponent: "DEN", proj: 12.1, weeks: [10.4, 13.8, 8.6, 15.2, null, 11.7, 14.3, 9.9, 12.6, 16.1] },
  { espnId: 900402, name: "Owen Castellano", position: "TE", nflTeam: "BAL", opponent: "PIT", proj: 9.6, weeks: [7.2, 5.9, 11.4, 8.8, 10.1, null, 6.5, 12.7, 9.3, 8.1] },
  { espnId: 900403, name: "Silas Brandt", position: "TE", nflTeam: "LV", opponent: "LAC", proj: 7.9, weeks: [4.1, 8.6, 6.3, 5.2, 9.7, 3.8, 7.4, null, 6.9, 10.2] },
  { espnId: 900404, name: "Wesley Achebe", position: "TE", nflTeam: "ARI", opponent: "SEA", proj: null, weeks: [null, null, null, null, null, null, null, null, null, null] },
];

function makePlayer(s: Spec): FantasyPlayer {
  return {
    id: `espn-${s.espnId}`,
    espnId: s.espnId,
    name: s.name,
    position: s.position,
    nflTeam: s.nflTeam,
    injuryStatus: s.injury ?? "ACTIVE",
    projectedPoints: s.proj,
    actualPoints: null,
    percentOwned: 60,
    percentStarted: 45,
    opponent: s.opponent,
    recentWeeks: s.weeks.flatMap((points, i) =>
      points == null ? [] : [{ week: i + 1, points }],
    ),
  };
}

export const EVAL_PLAYERS: FantasyPlayer[] = SPECS.map(makePlayer);
export const EVAL_PLAYER_BY_ID = new Map(EVAL_PLAYERS.map((p) => [p.espnId, p]));

/** Chip token exactly as the chat composer sends it: @[espnId|Name (TEAM)]. */
export function chip(espnId: number): string {
  const p = EVAL_PLAYER_BY_ID.get(espnId);
  if (!p) return `@[${espnId}|Unknown Player]`;
  return `@[${espnId}|${p.name} (${p.nflTeam})]`;
}

/** Fresh data (updated "just now") so no staleness warning skews replies. */
function makeFreshness(now = new Date()): PlayerPoolFreshness {
  return {
    season: EVAL_SEASON,
    currentWeek: EVAL_CURRENT_WEEK,
    statsThroughWeek: EVAL_STATS_THROUGH,
    statsUpdatedAt: now.toISOString(),
    projectionsUpdatedAt: now.toISOString(),
    latestWeekMissing: false,
    warning: null,
    scoringLabel: "full PPR",
  };
}

function makeMeta(scoringLabel?: string): ToolDisplayMeta {
  const sleeperByEspnId: Record<string, number> = {};
  for (const p of EVAL_PLAYERS) {
    if (p.projectedPoints != null) sleeperByEspnId[String(p.espnId)] = p.projectedPoints;
  }
  return {
    season: EVAL_SEASON,
    currentWeek: EVAL_CURRENT_WEEK,
    statsThroughWeek: EVAL_STATS_THROUGH,
    weekAxis: Array.from({ length: EVAL_STATS_THROUGH }, (_, i) => i + 1),
    dvpByKey: {},
    sleeperByEspnId,
    ...(scoringLabel ? { scoringLabel } : {}),
    sleeperEmpty: false,
    maxPts: 30,
  };
}

const byId = (id: number) => EVAL_PLAYER_BY_ID.get(id)!;

function team(
  id: number,
  name: string,
  record: [number, number],
  standing: number,
  roster: number[],
  isCurrentUser = false,
): FantasyTeam {
  return {
    id,
    name,
    abbrev: name.slice(0, 4).toUpperCase(),
    ownerName: `Owner ${id}`,
    wins: record[0],
    losses: record[1],
    ties: 0,
    pointsFor: 1000 + id * 37.5,
    pointsAgainst: 980 + id * 21.25,
    standing,
    roster: roster.map((r) => ({ ...byId(r), slot: byId(r).position })),
    ...(isCurrentUser ? { isCurrentUser: true } : {}),
  };
}

/** The user's team in the connected-league context. */
export const USER_ROSTER_IDS = [900102, 900201, 900203, 900301, 900305, 900401, 900206];

const connectedLeague: LeagueData = {
  leagueId: "eval-league",
  season: EVAL_SEASON,
  name: "Sunday Scaries League",
  currentWeek: EVAL_CURRENT_WEEK,
  scoringPeriodId: EVAL_CURRENT_WEEK,
  isDemo: false,
  platform: "sleeper",
  scoringFormat: "half_ppr",
  scoringLabel: "Half PPR",
  superflex: false,
  teams: [
    team(1, "Gridiron Gang", [6, 4], 4, USER_ROSTER_IDS, true),
    team(2, "Waiver Wire Warriors", [8, 2], 1, [900101, 900204, 900302, 900304, 900402]),
    team(3, "Fourth and Long", [7, 3], 2, [900104, 900202, 900306, 900303, 900403]),
    team(4, "Bench Mob", [3, 7], 6, [900103, 900205, 900307, 900308]),
    team(5, "Hail Mary Heroes", [7, 3], 3, [900207, 900404]),
    team(6, "Taco Tuesday", [4, 6], 5, []),
  ],
  matchups: [],
  freeAgents: [],
  lastSyncedAt: "2026-11-10T09:00:00.000Z",
  userTeamId: 1,
};

const phantomLeague: LeagueData = {
  leagueId: "nfl-pool",
  season: EVAL_SEASON,
  name: "NFL player pool",
  currentWeek: EVAL_CURRENT_WEEK,
  scoringPeriodId: EVAL_CURRENT_WEEK,
  isDemo: false,
  teams: [],
  matchups: [],
  freeAgents: EVAL_PLAYERS,
  lastSyncedAt: "2026-11-10T09:00:00.000Z",
};

export type EvalContextName = "noLeague" | "league";

export function buildEvalContext(name: EvalContextName): ChatDataContext {
  const playersByEspnId = new Map(EVAL_PLAYERS.map((p) => [p.espnId, p]));
  if (name === "league") {
    for (const t of connectedLeague.teams) {
      for (const p of t.roster) playersByEspnId.set(p.espnId, p);
    }
  }
  return {
    playersByEspnId,
    trends: {},
    freshness: makeFreshness(),
    meta: makeMeta(name === "league" ? "Half PPR" : undefined),
    teammateInjury: null,
    league: name === "league" ? connectedLeague : phantomLeague,
    hasConnectedLeague: name === "league",
  };
}
