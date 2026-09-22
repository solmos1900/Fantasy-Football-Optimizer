/**
 * ESPN Fantasy Football unofficial API client (2025–2026).
 *
 * Public leagues: leagueId + season only.
 * Private leagues: pass SWID + espn_s2 cookies from fantasy.espn.com.
 *
 * Primary endpoint pattern (season 2018+):
 *   https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{leagueId}
 *
 * Common views: mTeam, mRoster, mMatchup, mSettings, mStandings, kona_player_info
 */

import type {
  FantasyPlayer,
  FantasyTeam,
  InjuryStatus,
  LeagueData,
  Matchup,
  PlayerPosition,
} from "@/lib/types";

const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

const SLOT_MAP: Record<number, PlayerPosition | "FLEX" | "BN" | "IR"> = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  16: "D/ST",
  17: "K",
  20: "BN",
  21: "IR",
  23: "FLEX",
};

const POS_MAP: Record<number, PlayerPosition> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

export interface EspnCredentials {
  leagueId: string;
  season: number;
  swid?: string;
  espnS2?: string;
  /** ESPN team id for the logged-in manager, if known */
  teamId?: number;
}

export class EspnApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EspnApiError";
    this.status = status;
  }
}

function cookieHeader(swid?: string, espnS2?: string): string | undefined {
  const parts: string[] = [];
  if (swid) parts.push(`SWID=${swid}`);
  if (espnS2) parts.push(`espn_s2=${espnS2}`);
  return parts.length ? parts.join("; ") : undefined;
}

async function espnFetch(
  path: string,
  creds: EspnCredentials,
  params: Record<string, string | string[]> = {},
  headers: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${ESPN_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, v);
    } else {
      url.searchParams.set(key, value);
    }
  }

  const cookie = cookieHeader(creds.swid, creds.espnS2);
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new EspnApiError(
        "ESPN rejected the request — private leagues need valid SWID + espn_s2 cookies.",
        res.status,
      );
    }
    throw new EspnApiError(
      `ESPN API error ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      res.status,
    );
  }

  return res.json();
}

function injuryFromPlayer(player: Record<string, unknown>): InjuryStatus {
  const injury = player.injuryStatus as string | undefined;
  if (!injury) return "ACTIVE";
  const upper = injury.toUpperCase();
  if (upper.includes("QUESTIONABLE")) return "QUESTIONABLE";
  if (upper.includes("DOUBTFUL")) return "DOUBTFUL";
  if (upper.includes("OUT")) return "OUT";
  if (upper.includes("INJURY") || upper === "IR") return "IR";
  if (upper.includes("SUSPENSION")) return "SUSPENSION";
  return "ACTIVE";
}

function mapPlayer(
  entry: Record<string, unknown>,
  scoringPeriodId: number,
): FantasyPlayer {
  const playerPoolEntry = (entry.playerPoolEntry ?? entry) as Record<string, unknown>;
  const player = (playerPoolEntry.player ?? playerPoolEntry) as Record<string, unknown>;
  const stats = (player.stats as Record<string, unknown>[] | undefined) ?? [];
  const projected = stats.find(
    (s) =>
      s.scoringPeriodId === scoringPeriodId &&
      s.statSourceId === 1 &&
      s.statSplitTypeId === 1,
  );
  const actual = stats.find(
    (s) =>
      s.scoringPeriodId === scoringPeriodId &&
      s.statSourceId === 0 &&
      s.statSplitTypeId === 1,
  );

  const defaultPositionId = Number(player.defaultPositionId ?? 0);
  const position = POS_MAP[defaultPositionId] ?? "WR";
  const lineupSlotId = Number(entry.lineupSlotId ?? 20);
  const slot = SLOT_MAP[lineupSlotId] ?? "BN";
  const ownership = (player.ownership as Record<string, number> | undefined) ?? {};
  const proTeamId = Number(player.proTeamId ?? 0);

  const recentWeeks = stats
    .filter(
      (s) =>
        Number(s.statSourceId) === 0 &&
        Number(s.statSplitTypeId) === 1 &&
        Number(s.scoringPeriodId) > 0 &&
        Number(s.scoringPeriodId) < scoringPeriodId &&
        typeof s.appliedTotal === "number",
    )
    .map((s) => ({
      week: Number(s.scoringPeriodId),
      points: Number(s.appliedTotal),
    }))
    .sort((a, b) => b.week - a.week)
    .slice(0, 4);

  return {
    id: `espn-${player.id ?? playerPoolEntry.id}`,
    espnId: Number(player.id ?? 0),
    name: String(player.fullName ?? "Unknown"),
    position,
    nflTeam: proTeamId ? `T${proTeamId}` : "FA",
    injuryStatus: injuryFromPlayer(player),
    projectedPoints: Number((projected?.appliedTotal as number) ?? 0),
    actualPoints: Number((actual?.appliedTotal as number) ?? 0),
    percentOwned: Number(ownership.percentOwned ?? 0),
    percentStarted: Number(ownership.percentStarted ?? 0),
    slot,
    isStarter: slot !== "BN" && slot !== "IR",
    recentWeeks: recentWeeks.length ? recentWeeks : undefined,
  };
}

function mapTeam(
  team: Record<string, unknown>,
  scoringPeriodId: number,
  userTeamId?: number,
): FantasyTeam {
  const record = (team.record as { overall?: Record<string, number> } | undefined)?.overall ?? {};
  const roster = (team.roster as { entries?: Record<string, unknown>[] } | undefined)?.entries ?? [];
  const id = Number(team.id);

  return {
    id,
    name: String(team.name ?? `Team ${id}`),
    abbrev: String(team.abbrev ?? "TM"),
    ownerName: String(
      (team.owners as string[] | undefined)?.[0] ??
        (team.primaryOwner as string | undefined) ??
        "Manager",
    ),
    wins: Number(record.wins ?? 0),
    losses: Number(record.losses ?? 0),
    ties: Number(record.ties ?? 0),
    pointsFor: Number(record.pointsFor ?? team.points ?? 0),
    pointsAgainst: Number(record.pointsAgainst ?? 0),
    standing: Number(team.playoffSeed ?? team.rankCalculatedFinal ?? id),
    roster: roster.map((e) => mapPlayer(e, scoringPeriodId)),
    isCurrentUser: userTeamId != null ? id === userTeamId : false,
  };
}

export async function fetchEspnLeague(creds: EspnCredentials): Promise<LeagueData> {
  const path = `/seasons/${creds.season}/segments/0/leagues/${creds.leagueId}`;

  const raw = (await espnFetch(path, creds, {
    view: ["mTeam", "mRoster", "mMatchup", "mSettings", "mStandings"],
  })) as Record<string, unknown>;

  const status = (raw.status as Record<string, number> | undefined) ?? {};
  const settings = (raw.settings as { name?: string } | undefined) ?? {};
  const scoringPeriodId = Number(status.latestScoringPeriod ?? status.currentMatchupPeriod ?? 1);
  const teamsRaw = (raw.teams as Record<string, unknown>[]) ?? [];
  const schedule = (raw.schedule as Record<string, unknown>[]) ?? [];

  const teams = teamsRaw
    .map((t) => mapTeam(t, scoringPeriodId, creds.teamId))
    .sort((a, b) => a.standing - b.standing || b.pointsFor - a.pointsFor);

  const matchups: Matchup[] = schedule
    .filter((m) => Number(m.matchupPeriodId) === scoringPeriodId)
    .map((m, idx) => {
      const home = (m.home as Record<string, unknown>) ?? {};
      const away = (m.away as Record<string, unknown>) ?? {};
      return {
        id: Number(m.id ?? idx),
        week: scoringPeriodId,
        homeTeamId: Number(home.teamId ?? 0),
        awayTeamId: Number(away.teamId ?? 0),
        homeScore: Number(home.totalPointsLive ?? home.totalPoints ?? 0),
        awayScore: Number(away.totalPointsLive ?? away.totalPoints ?? 0),
        homeProjected: Number(home.totalProjectedPointsLive ?? home.totalProjectedPoints ?? 0),
        awayProjected: Number(away.totalProjectedPointsLive ?? away.totalProjectedPoints ?? 0),
        isLive: Boolean(m.isLiveOrRecent ?? false) || Number(status.currentMatchupPeriod) === scoringPeriodId,
      };
    });

  let freeAgents: FantasyPlayer[] = [];
  try {
    freeAgents = await fetchEspnFreeAgents(creds, scoringPeriodId);
  } catch {
    freeAgents = [];
  }

  return {
    leagueId: String(creds.leagueId),
    season: creds.season,
    name: String(settings.name ?? `League ${creds.leagueId}`),
    currentWeek: scoringPeriodId,
    scoringPeriodId,
    isDemo: false,
    teams,
    matchups,
    freeAgents,
    lastSyncedAt: new Date().toISOString(),
    userTeamId: creds.teamId,
  };
}

export async function fetchEspnFreeAgents(
  creds: EspnCredentials,
  scoringPeriodId: number,
  limit = 50,
): Promise<FantasyPlayer[]> {
  const path = `/seasons/${creds.season}/segments/0/leagues/${creds.leagueId}`;
  const filter = {
    players: {
      filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
      filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
      limit,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
    },
  };

  const raw = (await espnFetch(
    path,
    creds,
    { view: "kona_player_info", scoringPeriodId: String(scoringPeriodId) },
    { "x-fantasy-filter": JSON.stringify(filter) },
  )) as { players?: Record<string, unknown>[] };

  return (raw.players ?? []).map((entry) => mapPlayer(entry, scoringPeriodId));
}

/**
 * Public NFL scoreboard from ESPN site API (no key required).
 * Used for live game status refresh on the dashboard / team pages.
 */
export async function fetchEspnScoreboard(week?: number, season?: number): Promise<unknown> {
  const year = season ?? Number(process.env.DEFAULT_ESPN_SEASON ?? new Date().getFullYear());
  const url = new URL("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
  url.searchParams.set("seasontype", "2");
  url.searchParams.set("dates", String(year));
  if (week) url.searchParams.set("week", String(week));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new EspnApiError(`Scoreboard error ${res.status}`, res.status);
  }
  return res.json();
}
