/**
 * Derive current-week NFL opponent / venue labels from ESPN's public scoreboard.
 * Used when enriching FantasyPlayer.opponent after ESPN roster sync.
 */

import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";
import type { FantasyPlayer, LeagueData, LiveGame } from "@/lib/types";

export type NflScheduleEntry =
  | { kind: "game"; opponent: string; home: boolean }
  | { kind: "bye" };

export type ScoreboardEvent = {
  id?: string;
  status?: {
    type?: { state?: string; detail?: string; shortDetail?: string };
    period?: number;
    displayClock?: string;
  };
  competitions?: Array<{
    competitors?: Array<{
      homeAway?: string;
      score?: string;
      team?: { abbreviation?: string };
    }>;
  }>;
};

export type ParsedScoreboard = {
  games: LiveGame[];
  /** Team abbrev → schedule entry for teams that appear in scoreboard events */
  byTeam: Map<string, NflScheduleEntry>;
  eventCount: number;
};

export function parseEspnScoreboard(raw: {
  events?: ScoreboardEvent[];
}): ParsedScoreboard {
  const events = raw.events ?? [];
  const byTeam = new Map<string, NflScheduleEntry>();

  const games: LiveGame[] = events.slice(0, 16).map((event, idx) => {
    const comp = event.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === "home");
    const away = comp?.competitors?.find((c) => c.homeAway === "away");
    const homeAbbrev =
      normalizeNflAbbrev(home?.team?.abbreviation) ?? "HOME";
    const awayAbbrev =
      normalizeNflAbbrev(away?.team?.abbreviation) ?? "AWAY";

    if (homeAbbrev !== "HOME" && awayAbbrev !== "AWAY") {
      byTeam.set(homeAbbrev, {
        kind: "game",
        opponent: awayAbbrev,
        home: true,
      });
      byTeam.set(awayAbbrev, {
        kind: "game",
        opponent: homeAbbrev,
        home: false,
      });
    }

    const state = event.status?.type?.state ?? "pre";
    let status: LiveGame["status"] = "scheduled";
    if (state === "in") status = "in_progress";
    if (state === "post") status = "final";

    return {
      id: String(event.id ?? idx),
      home: homeAbbrev,
      away: awayAbbrev,
      homeScore: Number(home?.score ?? 0),
      awayScore: Number(away?.score ?? 0),
      status,
      quarter:
        status === "in_progress" ? `Q${event.status?.period ?? ""}` : undefined,
      clock: status === "in_progress" ? event.status?.displayClock : undefined,
    };
  });

  return { games, byTeam, eventCount: events.length };
}

/**
 * Format opponent string for UI / parseVenue: `@ MIA`, `vs NE`, or `BYE`.
 * Returns undefined when the team has no known schedule entry yet.
 */
export function formatOpponentLabel(
  nflTeam: string,
  schedule: Map<string, NflScheduleEntry>,
): string | undefined {
  const team = normalizeNflAbbrev(nflTeam);
  if (!team || team === "FA") return undefined;

  const entry = schedule.get(team);
  if (entry?.kind === "game") {
    return entry.home ? `vs ${entry.opponent}` : `@ ${entry.opponent}`;
  }
  if (entry?.kind === "bye") {
    return "BYE";
  }
  return undefined;
}

/**
 * Build a full-week schedule map: teams in games get matchups; other NFL teams
 * present on the roster are BYE when the scoreboard has real events.
 */
export function scheduleMapWithByes(
  byTeam: Map<string, NflScheduleEntry>,
  eventCount: number,
  knownTeams: Iterable<string>,
): Map<string, NflScheduleEntry> {
  const out = new Map(byTeam);
  if (eventCount <= 0) return out;

  for (const raw of knownTeams) {
    const team = normalizeNflAbbrev(raw);
    if (!team || team === "FA" || out.has(team)) continue;
    // Real NFL clubs absent from this week's board are on bye — not inventing matchups.
    // Skip placeholder ids like T99 from an incomplete map.
    if (/^[A-Z]{2,3}$/.test(team) && !/^T\d+$/.test(raw.trim().toUpperCase())) {
      out.set(team, { kind: "bye" });
    }
  }
  return out;
}

function applyOpponent(
  player: FantasyPlayer,
  schedule: Map<string, NflScheduleEntry>,
): FantasyPlayer {
  const opponent = formatOpponentLabel(player.nflTeam, schedule);
  if (!opponent || player.opponent === opponent) return player;
  return { ...player, opponent };
}

/**
 * Set `opponent` on every roster / free-agent player from the scoreboard week.
 * Does not invent matchups — only uses scoreboard-derived home/away or BYE.
 */
export function enrichLeagueOpponents(
  league: LeagueData,
  parsed: ParsedScoreboard,
): LeagueData {
  if (parsed.eventCount <= 0) return league;

  const rosterTeams = league.teams.flatMap((t) =>
    t.roster.map((p) => p.nflTeam),
  );
  const faTeams = league.freeAgents.map((p) => p.nflTeam);
  const schedule = scheduleMapWithByes(parsed.byTeam, parsed.eventCount, [
    ...rosterTeams,
    ...faTeams,
  ]);

  return {
    ...league,
    teams: league.teams.map((team) => ({
      ...team,
      roster: team.roster.map((p) => applyOpponent(p, schedule)),
    })),
    freeAgents: league.freeAgents.map((p) => applyOpponent(p, schedule)),
  };
}
