/**
 * Raw ESPN Fantasy API shapes used when mapping roster / player-pool entries.
 * Not the app's FantasyPlayer model — that lives in `@/lib/types`.
 */

/** One `player.stats[]` row from ESPN (weekly or season split). */
export type EspnPlayerStatBlock = {
  scoringPeriodId?: number;
  /** 0 = actual, 1 = projected */
  statSourceId?: number;
  /** 1 = weekly split used for recentWeeks */
  statSplitTypeId?: number;
  seasonId?: number;
  /**
   * NFL club for this scoring period. Top-level `player.proTeamId` is the
   * *current* club; after a mid-season trade this per-week id is the team
   * the player actually played for that week (0 / missing = unknown / FA).
   */
  proTeamId?: number;
  appliedTotal?: number | null;
  externalId?: string;
  id?: string;
  stats?: Record<string, number>;
};

export type EspnPlayerOwnership = {
  percentOwned?: number;
  percentStarted?: number;
};

export type EspnRawPlayer = {
  id?: number;
  fullName?: string;
  defaultPositionId?: number;
  /** Current NFL club (not historical). */
  proTeamId?: number;
  proTeamAbbreviation?: string;
  proTeamAbbrev?: string;
  proTeam?: { abbrev?: string };
  injuryStatus?: string;
  ownership?: EspnPlayerOwnership;
  stats?: EspnPlayerStatBlock[];
};
