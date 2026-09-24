import type {
  FantasyPlayer,
  PlayerPosition,
  PlayerRole,
  WeeklyScore,
} from "@/lib/types";

/**
 * Defense matchup history — how similar-role players fared vs a given defense.
 * Demo/seed tables cover common matchups; live leagues also use league-wide
 * recentWeeks when players faced that opponent.
 */

export interface DefenseSample {
  week: number;
  playerName: string;
  position: PlayerPosition;
  role: PlayerRole;
  points: number;
  nflTeam: string;
}

export interface DefenseMatchupResult {
  opponent: string;
  role: PlayerRole;
  samples: DefenseSample[];
  avgPoints: number;
  /** true when recent similar players were held well below typical fantasy floors */
  toughMatchup: boolean;
  summary: string;
}

/** Seeded recent outcomes used for demo + as fallback when ESPN history is thin. */
const SEEDED_DEFENSE_HISTORY: Record<string, DefenseSample[]> = {
  CLE: [
    {
      week: 4,
      playerName: "Courtland Sutton",
      position: "WR",
      role: "wr_slot",
      points: 3.2,
      nflTeam: "DEN",
    },
    {
      week: 5,
      playerName: "Rome Odunze",
      position: "WR",
      role: "wr_slot",
      points: 4.1,
      nflTeam: "CHI",
    },
    {
      week: 6,
      playerName: "DK Metcalf",
      position: "WR",
      role: "wr_outside",
      points: 11.8,
      nflTeam: "SEA",
    },
    {
      week: 5,
      playerName: "James Conner",
      position: "RB",
      role: "rb1",
      points: 8.4,
      nflTeam: "ARI",
    },
    {
      week: 6,
      playerName: "Bo Nix",
      position: "QB",
      role: "qb",
      points: 12.1,
      nflTeam: "DEN",
    },
  ],
  DEN: [
    {
      week: 3,
      playerName: "Davante Adams",
      position: "WR",
      role: "wr_outside",
      points: 5.0,
      nflTeam: "NYJ",
    },
    {
      week: 4,
      playerName: "Jayden Reed",
      position: "WR",
      role: "wr_slot",
      points: 6.2,
      nflTeam: "GB",
    },
    {
      week: 5,
      playerName: "Rachaad White",
      position: "RB",
      role: "rb1",
      points: 7.1,
      nflTeam: "TB",
    },
    {
      week: 6,
      playerName: "Baker Mayfield",
      position: "QB",
      role: "qb",
      points: 9.4,
      nflTeam: "TB",
    },
  ],
  SF: [
    {
      week: 4,
      playerName: "Breece Hall",
      position: "RB",
      role: "rb1",
      points: 6.8,
      nflTeam: "NYJ",
    },
    {
      week: 5,
      playerName: "Trey Benson",
      position: "RB",
      role: "rb2",
      points: 3.4,
      nflTeam: "ARI",
    },
    {
      week: 6,
      playerName: "Amon-Ra St. Brown",
      position: "WR",
      role: "wr_slot",
      points: 8.9,
      nflTeam: "DET",
    },
    {
      week: 5,
      playerName: "Tyler Higbee",
      position: "TE",
      role: "te",
      points: 4.2,
      nflTeam: "LAR",
    },
  ],
  BAL: [
    {
      week: 4,
      playerName: "Tua Tagovailoa",
      position: "QB",
      role: "qb",
      points: 10.2,
      nflTeam: "MIA",
    },
    {
      week: 5,
      playerName: "Tyreek Hill",
      position: "WR",
      role: "wr_outside",
      points: 7.5,
      nflTeam: "MIA",
    },
    {
      week: 6,
      playerName: "Saquon Barkley",
      position: "RB",
      role: "rb1",
      points: 9.0,
      nflTeam: "PHI",
    },
  ],
  GB: [
    {
      week: 5,
      playerName: "Jayden Reed",
      position: "WR",
      role: "wr_slot",
      points: 14.2,
      nflTeam: "GB",
    },
    {
      week: 6,
      playerName: "Jahmyr Gibbs",
      position: "RB",
      role: "rb1",
      points: 18.6,
      nflTeam: "DET",
    },
  ],
  SEA: [
    {
      week: 4,
      playerName: "Puka Nacua",
      position: "WR",
      role: "wr_outside",
      points: 9.1,
      nflTeam: "LAR",
    },
    {
      week: 5,
      playerName: "Jalen Tolbert",
      position: "WR",
      role: "wr_slot",
      points: 7.4,
      nflTeam: "DAL",
    },
    {
      week: 6,
      playerName: "Travis Kelce",
      position: "TE",
      role: "te",
      points: 5.8,
      nflTeam: "KC",
    },
  ],
  MIA: [
    {
      week: 5,
      playerName: "Josh Allen",
      position: "QB",
      role: "qb",
      points: 24.1,
      nflTeam: "BUF",
    },
    {
      week: 6,
      playerName: "CeeDee Lamb",
      position: "WR",
      role: "wr_outside",
      points: 16.4,
      nflTeam: "DAL",
    },
  ],
  NE: [
    {
      week: 5,
      playerName: "Breece Hall",
      position: "RB",
      role: "rb1",
      points: 15.2,
      nflTeam: "NYJ",
    },
    {
      week: 6,
      playerName: "Rome Odunze",
      position: "WR",
      role: "wr_slot",
      points: 11.0,
      nflTeam: "CHI",
    },
  ],
};

const ROLE_FLOOR: Partial<Record<PlayerRole, number>> = {
  qb: 14,
  rb1: 12,
  rb2: 7,
  wr_slot: 9,
  wr_outside: 10,
  te: 8,
};

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

/**
 * Collect similar-role outcomes vs an opponent from league recentWeeks + seed table.
 */
export function analyzeDefenseMatchup(
  player: FantasyPlayer,
  allPlayers: FantasyPlayer[],
): DefenseMatchupResult | null {
  const opponent = normalizeOpponentAbbrev(player.opponent);
  if (!opponent) return null;

  const role = inferPlayerRole(player);
  const samples: DefenseSample[] = [];

  for (const other of allPlayers) {
    if (other.id === player.id) continue;
    if (inferPlayerRole(other) !== role && other.position !== player.position) continue;
    const weeks = other.recentWeeks ?? [];
    for (const w of weeks) {
      const weekOpp = normalizeOpponentAbbrev(w.opponent);
      if (weekOpp === opponent) {
        samples.push({
          week: w.week,
          playerName: other.name,
          position: other.position,
          role: inferPlayerRole(other),
          points: w.points,
          nflTeam: other.nflTeam,
        });
      }
    }
  }

  const seeded = (SEEDED_DEFENSE_HISTORY[opponent] ?? []).filter(
    (s) => s.role === role || s.position === player.position,
  );
  for (const s of seeded) {
    if (!samples.some((x) => x.week === s.week && x.playerName === s.playerName)) {
      samples.push(s);
    }
  }

  const roleSamples = samples.filter((s) => s.role === role);
  const useSamples = roleSamples.length >= 1 ? roleSamples : samples;
  if (!useSamples.length) return null;

  const avgPoints =
    useSamples.reduce((a, s) => a + s.points, 0) / useSamples.length;
  const floor = ROLE_FLOOR[role] ?? 8;
  const toughMatchup = avgPoints < floor - 2;

  const concrete = useSamples
    .slice(0, 3)
    .map(
      (s) =>
        `${s.playerName} (${roleLabel(s.role)}) scored ${s.points.toFixed(1)} in week ${s.week}`,
    )
    .join("; ");

  const summary = toughMatchup
    ? `Tough matchup: similar ${roleLabel(role)}s averaged only ${avgPoints.toFixed(1)} points vs ${opponent} lately (${concrete}).`
    : `Matchup look: similar ${roleLabel(role)}s averaged ${avgPoints.toFixed(1)} points vs ${opponent} lately (${concrete}).`;

  return {
    opponent,
    role,
    samples: useSamples,
    avgPoints,
    toughMatchup,
    summary,
  };
}

export function recentFormSummary(player: FantasyPlayer): string | null {
  const weeks = player.recentWeeks;
  if (!weeks?.length) return null;
  const sorted = [...weeks].sort((a, b) => b.week - a.week).slice(0, 3);
  const avg = sorted.reduce((a, w) => a + w.points, 0) / sorted.length;
  const detail = sorted.map((w) => w.points.toFixed(1)).join(", ");
  return `${player.name} scored ${detail} over the last ${sorted.length === 1 ? "1 game" : `${sorted.length} games`} — about ${avg.toFixed(1)} points per game.`;
}

export function averageRecentPoints(weeks?: WeeklyScore[], n = 3): number | null {
  if (!weeks?.length) return null;
  const sorted = [...weeks].sort((a, b) => b.week - a.week).slice(0, n);
  if (!sorted.length) return null;
  return sorted.reduce((a, w) => a + w.points, 0) / sorted.length;
}

/** Flatten seeded defense comps for Neon DefenseWeekAllow rows. */
export function seededDefenseAllowRows(season: number): {
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
  source: string;
}[] {
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
    source: string;
  }[] = [];
  for (const [abbr, samples] of Object.entries(SEEDED_DEFENSE_HISTORY)) {
    for (const s of samples) {
      rows.push({
        defenseAbbrev: abbr,
        nflTeam: abbr,
        season,
        week: s.week,
        position: s.position,
        vsPosition: s.position,
        role: s.role,
        pointsAllowed: s.points,
        pointsAllowedPpr: s.points,
        samplePlayer: s.playerName,
        source: "seed",
      });
    }
  }
  return rows;
}
