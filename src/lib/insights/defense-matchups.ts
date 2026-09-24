import type {
  FantasyPlayer,
  LeagueData,
  PlayerPosition,
  PlayerRole,
  WeeklyScore,
} from "@/lib/types";

/**
 * Defense matchup history — how similar-role players fared vs a given defense.
 *
 * Sources (live leagues): completed-week fantasy scores on league rosters /
 * free agents, with opponents from ESPN's public NFL scoreboard. Never invent
 * named-player week/point comps. Demo leagues may use labeled demo weeks only.
 */

export interface DefenseSample {
  week: number;
  /** Season year for this sample (required so prior-year lines can show the year). */
  season: number;
  playerName: string;
  position: PlayerPosition;
  role: PlayerRole;
  points: number;
  nflTeam: string;
}

export interface DefenseMatchupContext {
  /** Current scoring period / week — only weeks strictly before this are allowed. */
  currentWeek: number;
  season: number;
  isDemo?: boolean;
}

export interface DefenseMatchupResult {
  opponent: string;
  role: PlayerRole;
  samples: DefenseSample[];
  avgPoints: number;
  /** true when recent similar players were held well below typical fantasy floors */
  toughMatchup: boolean;
  summary: string;
  emptyReason: string | null;
}

const ROLE_FLOOR: Partial<Record<PlayerRole, number>> = {
  qb: 14,
  rb1: 12,
  rb2: 7,
  wr_slot: 9,
  wr_outside: 10,
  te: 8,
};

export function matchupContextFromLeague(
  league: Pick<LeagueData, "scoringPeriodId" | "currentWeek" | "season" | "isDemo">,
): DefenseMatchupContext {
  return {
    currentWeek: league.scoringPeriodId || league.currentWeek,
    season: league.season,
    isDemo: Boolean(league.isDemo),
  };
}

export function normalizeOpponentAbbrev(opponent?: string): string | null {
  if (!opponent) return null;
  const cleaned = opponent
    .replace(/^vs\.?\s*/i, "")
    .replace(/^@\s*/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!cleaned || cleaned === "BYE" || cleaned.length > 4) return null;
  return cleaned;
}

export function inferPlayerRole(player: FantasyPlayer): PlayerRole {
  if (player.role && player.role !== "unknown") return player.role;
  switch (player.position) {
    case "QB":
      return "qb";
    case "TE":
      return "te";
    case "K":
      return "k";
    case "D/ST":
      return "dst";
    case "RB":
      return player.percentStarted >= 55 || player.projectedPoints >= 12 ? "rb1" : "rb2";
    case "WR":
      if (player.percentStarted >= 70 && player.projectedPoints < 14) return "wr_slot";
      if (player.projectedPoints >= 13) return "wr_outside";
      return player.percentStarted >= 40 ? "wr_slot" : "wr_outside";
    default:
      return "unknown";
  }
}

function roleLabel(role: PlayerRole): string {
  switch (role) {
    case "wr_slot":
      return "slot WR";
    case "wr_outside":
      return "outside WR";
    case "rb1":
      return "RB1";
    case "rb2":
      return "RB2";
    case "qb":
      return "QB";
    case "te":
      return "TE";
    case "k":
      return "K";
    case "dst":
      return "D/ST";
    default:
      return "player";
  }
}

function positionNoun(position: PlayerPosition): string {
  switch (position) {
    case "QB":
      return "QBs";
    case "RB":
      return "RBs";
    case "WR":
      return "WRs";
    case "TE":
      return "TEs";
    case "K":
      return "kickers";
    case "D/ST":
      return "D/STs";
    default:
      return "players";
  }
}

/** True only for completed weeks strictly before the current scoring period. */
export function isCompletedWeek(week: number, currentWeek: number): boolean {
  return Number.isFinite(week) && week >= 1 && week < currentWeek;
}

export function emptyDefenseMatchupMessage(
  position: PlayerPosition,
  defenseAbbrev: string | null,
  currentWeek: number,
): string {
  const def = defenseAbbrev ?? "this defense";
  if (currentWeek <= 1) {
    return `Not enough completed games of similar ${positionNoun(position)} vs ${def} yet this season — Week 1 has not finished.`;
  }
  return `Not enough completed games of similar ${positionNoun(position)} vs ${def} yet this season.`;
}

function weekPhrase(sample: DefenseSample, contextSeason: number): string {
  if (sample.season !== contextSeason) {
    return `${sample.season} week ${sample.week}`;
  }
  return `week ${sample.week}`;
}

/**
 * Collect similar-role outcomes vs an opponent from real completed-week scores
 * on the league roster / free-agent pool. No fabricated seed comps.
 */
export function analyzeDefenseMatchup(
  player: FantasyPlayer,
  allPlayers: FantasyPlayer[],
  context: DefenseMatchupContext,
): DefenseMatchupResult | null {
  const opponent = normalizeOpponentAbbrev(player.opponent);
  if (!opponent) return null;

  const role = inferPlayerRole(player);
  const samples: DefenseSample[] = [];

  for (const other of allPlayers) {
    if (other.id === player.id) continue;
    if (inferPlayerRole(other) !== role && other.position !== player.position) {
      continue;
    }
    const weeks = other.recentWeeks ?? [];
    for (const w of weeks) {
      if (!isCompletedWeek(w.week, context.currentWeek)) continue;
      // Require a real opponent label — never invent one from the defense alone.
      const weekOpp = normalizeOpponentAbbrev(w.opponent);
      if (weekOpp !== opponent) continue;
      if (typeof w.points !== "number" || !Number.isFinite(w.points)) continue;

      samples.push({
        week: w.week,
        season: context.season,
        playerName: other.name,
        position: other.position,
        role: inferPlayerRole(other),
        points: w.points,
        nflTeam: other.nflTeam,
      });
    }
  }

  const roleSamples = samples.filter((s) => s.role === role);
  const useSamples = roleSamples.length >= 1 ? roleSamples : samples;
  if (!useSamples.length) {
    return {
      opponent,
      role,
      samples: [],
      avgPoints: 0,
      toughMatchup: false,
      summary: emptyDefenseMatchupMessage(
        player.position,
        opponent,
        context.currentWeek,
      ),
      emptyReason: emptyDefenseMatchupMessage(
        player.position,
        opponent,
        context.currentWeek,
      ),
    };
  }

  const avgPoints =
    useSamples.reduce((a, s) => a + s.points, 0) / useSamples.length;
  const floor = ROLE_FLOOR[role] ?? 8;
  const toughMatchup = avgPoints < floor - 2;

  const concrete = useSamples
    .slice(0, 3)
    .map(
      (s) =>
        `${s.playerName} (${roleLabel(s.role)}) scored ${s.points.toFixed(1)} in ${weekPhrase(s, context.season)}`,
    )
    .join("; ");

  const demoNote = context.isDemo ? " Demo league history only." : "";
  const summary = toughMatchup
    ? `Tough matchup: similar ${roleLabel(role)}s averaged only ${avgPoints.toFixed(1)} points vs ${opponent} in completed weeks (${concrete}).${demoNote}`
    : `Matchup look: similar ${roleLabel(role)}s averaged ${avgPoints.toFixed(1)} points vs ${opponent} in completed weeks (${concrete}).${demoNote}`;

  return {
    opponent,
    role,
    samples: useSamples,
    avgPoints,
    toughMatchup,
    summary,
    emptyReason: null,
  };
}

export function recentFormSummary(player: FantasyPlayer): string | null {
  const weeks = player.recentWeeks;
  if (!weeks?.length) return null;
  const sorted = [...weeks].sort((a, b) => b.week - a.week).slice(0, 3);
  const avg = sorted.reduce((a, w) => a + w.points, 0) / sorted.length;
  const detail = sorted.map((w) => w.points.toFixed(1)).join(", ");
  return `${player.name} scored ${detail} over the last ${sorted.length} games — about ${avg.toFixed(1)} points per game.`;
}

export function averageRecentPoints(weeks?: WeeklyScore[], n = 3): number | null {
  if (!weeks?.length) return null;
  const sorted = [...weeks].sort((a, b) => b.week - a.week).slice(0, n);
  if (!sorted.length) return null;
  return sorted.reduce((a, w) => a + w.points, 0) / sorted.length;
}

/**
 * Persist only real completed-week comps observed on this league (ESPN sync or
 * labeled demo). Never fabricates rows.
 */
export function defenseAllowRowsFromLeague(league: LeagueData): {
  defenseAbbrev: string;
  nflTeam: string;
  season: number;
  week: number;
  position: string;
  vsPosition: string;
  role: string;
  pointsAllowed: number;
  pointsAllowedPpr: number;
  samplePlayer: string;
  source: "espn" | "demo";
}[] {
  const context = matchupContextFromLeague(league);
  const source = league.isDemo ? "demo" : "espn";
  const players = [
    ...league.teams.flatMap((t) => t.roster),
    ...league.freeAgents,
  ];
  const rows: {
    defenseAbbrev: string;
    nflTeam: string;
    season: number;
    week: number;
    position: string;
    vsPosition: string;
    role: string;
    pointsAllowed: number;
    pointsAllowedPpr: number;
    samplePlayer: string;
    source: "espn" | "demo";
  }[] = [];
  const seen = new Set<string>();

  for (const player of players) {
    for (const w of player.recentWeeks ?? []) {
      if (!isCompletedWeek(w.week, context.currentWeek)) continue;
      const defenseAbbrev = normalizeOpponentAbbrev(w.opponent);
      if (!defenseAbbrev) continue;
      if (typeof w.points !== "number" || !Number.isFinite(w.points)) continue;
      const role = inferPlayerRole(player);
      const key = `${defenseAbbrev}|${context.season}|${w.week}|${player.position}|${role}|${player.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        defenseAbbrev,
        nflTeam: defenseAbbrev,
        season: context.season,
        week: w.week,
        position: player.position,
        vsPosition: player.position,
        role,
        pointsAllowed: w.points,
        pointsAllowedPpr: w.points,
        samplePlayer: player.name,
        source,
      });
    }
  }
  return rows;
}
