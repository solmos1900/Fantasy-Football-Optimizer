export type PlayerPosition = "QB" | "RB" | "WR" | "TE" | "K" | "D/ST" | "FLEX" | "BN" | "IR";

export type InjuryStatus =
  | "ACTIVE"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "IR"
  | "SUSPENSION"
  | "UNKNOWN";

export interface FantasyPlayer {
  id: string;
  espnId: number;
  name: string;
  position: PlayerPosition;
  nflTeam: string;
  injuryStatus: InjuryStatus;
  projectedPoints: number;
  actualPoints: number;
  percentOwned: number;
  percentStarted: number;
  opponent?: string;
  slot?: PlayerPosition | "FLEX" | "BN" | "IR";
  isStarter?: boolean;
}

export interface FantasyTeam {
  id: number;
  name: string;
  abbrev: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  standing: number;
  roster: FantasyPlayer[];
  isCurrentUser?: boolean;
}

export interface Matchup {
  id: number;
  week: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  homeProjected: number;
  awayProjected: number;
  isLive: boolean;
}

export interface LeagueData {
  leagueId: string;
  season: number;
  name: string;
  currentWeek: number;
  scoringPeriodId: number;
  isDemo: boolean;
  teams: FantasyTeam[];
  matchups: Matchup[];
  freeAgents: FantasyPlayer[];
  lastSyncedAt: string;
  userTeamId?: number;
}

export interface InsightRecommendation {
  id: string;
  type: "start_sit" | "drop_add" | "weak_position" | "mismatch" | "streaming";
  priority: "high" | "medium" | "low";
  title: string;
  summary: string;
  reasoning: string[];
  relatedPlayerIds?: string[];
  relatedPositions?: PlayerPosition[];
}

export interface LiveStatSnapshot {
  week: number;
  updatedAt: string;
  games: LiveGame[];
  topPerformers: { playerName: string; position: string; points: number; team: string }[];
}

export interface LiveGame {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: "scheduled" | "in_progress" | "final";
  quarter?: string;
  clock?: string;
}
