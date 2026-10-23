export type PlayerPosition = "QB" | "RB" | "WR" | "TE" | "K" | "D/ST" | "FLEX" | "BN" | "IR";

export type InjuryStatus =
  | "ACTIVE"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "IR"
  | "PUP"
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
  /**
   * Actual PPR (or league scoring) for the week.
   * Null when ESPN/nflverse has not published an actual yet — never treat as 0.
   */
  points: number | null;
  /** Projected PPR for that week when ESPN/demo/snapshot provides it */
  projectedPoints?: number;
  /** Opponent abbreviation when known, e.g. CLE or @CLE */
  opponent?: string;
  /**
   * NFL team the player was on for this scoring week when known
   * (e.g. ESPN stats[].proTeamId). Distinct from FantasyPlayer.nflTeam
   * (current club) so mid-season trades keep correct past-week opponents.
   */
  nflTeam?: string;
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
  /**
   * This-week projection when ESPN/Sleeper published one.
   * Null = unknown (not yet published) — never coerce missing to 0.0.
   * A real published 0.0 (e.g. OUT/IR sit) is kept as 0.
   */
  projectedPoints: number | null;
  /**
   * This-week actual when ESPN published one.
   * Null = unknown / not yet scored — never coerce missing to 0.0.
   * A real published 0.0 duck is kept as 0.
   */
  actualPoints: number | null;
  percentOwned: number;
  percentStarted: number;
  opponent?: string;
  slot?: PlayerPosition | "FLEX" | "BN" | "IR";
  isStarter?: boolean;
  /** Prior-week PPR (or league scoring) when available from ESPN/demo. */
  recentWeeks?: WeeklyScore[];
  /** Slot vs outside / RB1 vs RB2 style role for defense comparisons. */
  role?: PlayerRole;
  /** nflverse DEV / practice-squad designation for UI label. */
  practiceSquad?: boolean;
  /** Team resolved from a single source (usually Sleeper post-cut). */
  singleSourceTeam?: boolean;
  /**
   * Reserve/Left Squad — under contract, not allowed to play.
   * Unrosterable for trades / who-to-start; never invent trade value.
   */
  reserveLeftSquad?: boolean;
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
  /**
   * Non-fatal Sync/Connect problems (e.g. free-agent refresh failed).
   * Cleared on the next successful refresh of that data.
   */
  syncWarnings?: string[];
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
