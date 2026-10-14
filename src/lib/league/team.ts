import type { FantasyTeam, LeagueData } from "@/lib/types";

/**
 * On reconnect/update: keep the saved team unless a new teamId is explicitly sent.
 * On first connect: allow null until the user picks a team.
 */
export function resolvePersistedTeamId(
  incomingTeamId: number | undefined,
  existingTeamId: number | null | undefined,
): number | null {
  if (
    incomingTeamId != null &&
    Number.isFinite(incomingTeamId) &&
    incomingTeamId > 0
  ) {
    return incomingTeamId;
  }
  if (
    existingTeamId != null &&
    Number.isFinite(existingTeamId) &&
    existingTeamId > 0
  ) {
    return existingTeamId;
  }
  return null;
}

/** Stamp (or clear) which fantasy team belongs to the current user. */
export function applyUserTeamId(
  league: LeagueData,
  teamId: number | null | undefined,
): LeagueData {
  if (teamId == null) {
    return {
      ...league,
      userTeamId: undefined,
      teams: league.teams.map((t) => ({ ...t, isCurrentUser: false })),
    };
  }
  return {
    ...league,
    userTeamId: teamId,
    teams: league.teams.map((t) => ({
      ...t,
      isCurrentUser: t.id === teamId,
    })),
  };
}

/**
 * Resolve the user's team from explicit markers only.
 * Never falls back to teams[0] — that would silently show another manager's roster.
 */
export function resolveUserTeam(
  league: LeagueData,
): FantasyTeam | undefined {
  const byFlag = league.teams.find((t) => t.isCurrentUser);
  if (byFlag) return byFlag;
  if (league.userTeamId != null) {
    return league.teams.find((t) => t.id === league.userTeamId);
  }
  return undefined;
}
