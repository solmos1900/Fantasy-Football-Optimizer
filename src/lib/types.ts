export type PlayerPosition = "QB" | "RB" | "WR" | "TE" | "K" | "D/ST" | "FLEX" | "BN" | "IR";

export type InjuryStatus =
  | "ACTIVE"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "IR"
  | "SUSPENSION"
  | "UNKNOWN";

/** Rough role bucket for matchup-history comparisons (same position / similar usage). */
export type PlayerRole =
  | "qb"
  | "rb1"
  | "rb2"
  | "wr_slot"
  | "wr_outside"
  | "te"
  | "k"
  | "dst"
  | "unknown";

export interface WeeklyScore {
  week: number;
  /** Actual PPR (or league scoring) for the week */
  points: number;
  /** Projected PPR for that week when ESPN/demo/snapshot provides it */
  projectedPoints?: number;
  /** Opponent abbreviation when known, e.g. CLE or @CLE */
  opponent?: string;
}

/** Persisted / computed trend analyst labels (research brief). */
export type PlayerTrendLabel =
  | "Rising"
  | "Stable"
  | "Fading"
  | "BoomBust"
  | "InjuryRisk"
  | "Thin"
  // legacy aliases still accepted when reading older rows
  | "hot"
  | "cold"
  | "boom"
  | "bust"
  | "rising"
  | "falling"
  | "steady"
  | "thin";

export type UsageTrend = "rising" | "falling" | "steady" | "unknown";

export interface PlayerTrendView {
  espnId: number;
  playerName: string;
  position: string;
  trendLabel: PlayerTrendLabel;
  usageTrend: UsageTrend;
  weeksSampled: number;
  avgProjected: number | null;
  avgActual: number | null;
  avgDelta: number | null;
  recentFormAvg: number | null;
  restOfSeasonAdj: number;
  rationale: string;
  evidenceSentence?: string;
  facts?: Record<string, unknown>;
  judgments?: string[];
  /** Recent weeks with proj vs actual for spark/table UI */
  weeks: {
    week: number;
    projected: number | null;
    actual: number | null;
    opponent?: string | null;
  }[];
}

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
  /** Prior-week PPR (or league scoring) when available from ESPN/demo. */
  recentWeeks?: WeeklyScore[];
  /** Slot vs outside / RB1 vs RB2 style role for defense comparisons. */
  role?: PlayerRole;
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

export type InsightType =
  | "start_sit"
  | "trade"
  | "news"
  | "matchup_note"
  | "drop_add"
  | "weak_position"
  | "mismatch"
  | "streaming"
  | "waiver";

// Keep alias used by some call sites
export type InsightKind = InsightType;

export interface TradeProposal {
  partnerTeamId: number;
  partnerTeamName: string;
  give: { id: string; name: string; position: PlayerPosition }[];
  receive: { id: string; name: string; position: PlayerPosition }[];
  whyYou: string[];
  whyThem: string[];
  /** Plain-language trend/projection rationale for the deal */
  trendNotes?: string[];
  /** Alternate sendable names (2–4) to raise acceptance — research brief */
  alternativeSendables?: { id: string; name: string; position: PlayerPosition }[];
}

export interface InsightRecommendation {
  id: string;
  type: InsightType;
  priority: "high" | "medium" | "low";
  title: string;
  summary: string;
  reasoning: string[];
  relatedPlayerIds?: string[];
  relatedPositions?: PlayerPosition[];
  /** START = put in lineup; SIT/BENCH = leave on bench / sit from lineup */
  verdict?: "START" | "SIT" | "BENCH";
  trade?: TradeProposal;
  newsUrl?: string;
  source?: string;
  publishedAt?: string;
}

export interface InsightsBundle {
  startSit: InsightRecommendation[];
  trades: InsightRecommendation[];
  waivers: InsightRecommendation[];
  news: InsightRecommendation[];
  matchupNotes: InsightRecommendation[];
  other: InsightRecommendation[];
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

export interface PlayerNewsItem {
  id: string;
  headline: string;
  description?: string;
  url: string;
  source: string;
  publishedAt?: string;
  playerNames: string[];
}
