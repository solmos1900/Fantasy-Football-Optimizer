import { prisma } from "@/lib/db";
import {
  applyDemoOwnerDisplayName,
  createDemoLeague,
} from "@/lib/demo/seed";
import { fetchEspnLeague, type EspnCredentials } from "@/lib/espn/client";
import { refreshProjectionTrends } from "@/lib/insights/trends";
import type { LeagueData } from "@/lib/types";

async function persistTrendsSafe(league: LeagueData): Promise<void> {
  try {
    await refreshProjectionTrends(league);
  } catch (err) {
    // Trends are best-effort — never block sync if Neon is briefly unavailable
    console.error("[trends] refresh failed", err);
  }
}

async function demoOwnerDisplayName(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? null;
  } catch (err) {
    console.error("[league] demoOwnerDisplayName failed", err);
    return null;
  }
}

/** Current demo season shape — stale caches from older seeds are rebuilt. */
const DEMO_SCORING_PERIOD = 3;

function isCurrentDemoShape(league: LeagueData): boolean {
  return (
    league.isDemo === true &&
    Number(league.scoringPeriodId) === DEMO_SCORING_PERIOD &&
    Number(league.currentWeek) === DEMO_SCORING_PERIOD &&
    Array.isArray(league.teams) &&
    league.teams.length > 0
  );
}

export async function getUserLeagueConnection(userId: string) {
  try {
    return await prisma.leagueConnection.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
  } catch (err) {
    // Never take down app chrome after guest/auth — empty state is recoverable.
    console.error("[league] getUserLeagueConnection failed", err);
    return null;
  }
}

export async function getLeagueDataForUser(userId: string): Promise<LeagueData | null> {
  const connection = await getUserLeagueConnection(userId);
  if (!connection) return null;

  const ownerName = connection.isDemo
    ? await demoOwnerDisplayName(userId)
    : null;

  if (connection.cachedPayload) {
    try {
      const cached = JSON.parse(connection.cachedPayload) as LeagueData;
      if (connection.isDemo) {
        // Pre–week-3 demo caches (and any corrupt payload) can blow up Insights /
        // defense comps after the completed-week-only change. Rebuild instead.
        if (isCurrentDemoShape(cached)) {
          return applyDemoOwnerDisplayName(cached, ownerName);
        }
      } else {
        return cached;
      }
    } catch {
      // fall through
    }
  }

  if (connection.isDemo) {
    const demo = createDemoLeague(connection.teamId ?? 1, {
      ownerDisplayName: ownerName,
    });
    try {
      await prisma.leagueConnection.update({
        where: { id: connection.id },
        data: {
          cachedPayload: JSON.stringify(demo),
          lastSyncedAt: new Date(),
          leagueName: demo.name,
        },
      });
    } catch (err) {
      console.error("[league] failed to persist rebuilt demo cache", err);
    }
    await persistTrendsSafe(demo);
    return demo;
  }

  return null;
}

export async function connectDemoLeague(userId: string): Promise<LeagueData> {
  const ownerName = await demoOwnerDisplayName(userId);
  const demo = createDemoLeague(1, { ownerDisplayName: ownerName });
  await prisma.leagueConnection.upsert({
    where: {
      userId_leagueId_season: {
        userId,
        leagueId: demo.leagueId,
        season: demo.season,
      },
    },
    update: {
      isDemo: true,
      teamId: 1,
      leagueName: demo.name,
      espnSwid: null,
      espnS2: null,
      cachedPayload: JSON.stringify(demo),
      lastSyncedAt: new Date(),
    },
    create: {
      userId,
      leagueId: demo.leagueId,
      season: demo.season,
      teamId: 1,
      leagueName: demo.name,
      isDemo: true,
      cachedPayload: JSON.stringify(demo),
      lastSyncedAt: new Date(),
    },
  });
  await persistTrendsSafe(demo);
  return demo;
}

export async function connectEspnLeague(
  userId: string,
  input: {
    leagueId: string;
    season: number;
    teamId?: number;
    swid?: string;
    espnS2?: string;
  },
): Promise<LeagueData> {
  const creds: EspnCredentials = {
    leagueId: input.leagueId.trim(),
    season: input.season,
    teamId: input.teamId,
    swid: input.swid?.trim() || undefined,
    espnS2: input.espnS2?.trim() || undefined,
  };

  const league = await fetchEspnLeague(creds);

  if (input.teamId) {
    league.userTeamId = input.teamId;
    league.teams = league.teams.map((t) => ({
      ...t,
      isCurrentUser: t.id === input.teamId,
    }));
  }

  await prisma.leagueConnection.upsert({
    where: {
      userId_leagueId_season: {
        userId,
        leagueId: creds.leagueId,
        season: creds.season,
      },
    },
    update: {
      isDemo: false,
      teamId: input.teamId ?? null,
      leagueName: league.name,
      espnSwid: creds.swid ?? null,
      espnS2: creds.espnS2 ?? null,
      cachedPayload: JSON.stringify(league),
      lastSyncedAt: new Date(),
    },
    create: {
      userId,
      leagueId: creds.leagueId,
      season: creds.season,
      teamId: input.teamId ?? null,
      leagueName: league.name,
      isDemo: false,
      espnSwid: creds.swid ?? null,
      espnS2: creds.espnS2 ?? null,
      cachedPayload: JSON.stringify(league),
      lastSyncedAt: new Date(),
    },
  });

  await persistTrendsSafe(league);
  return league;
}

export async function refreshUserLeague(userId: string): Promise<LeagueData> {
  const connection = await getUserLeagueConnection(userId);
  if (!connection) {
    throw new Error("No league connected");
  }

  if (connection.isDemo) {
    return connectDemoLeague(userId);
  }

  return connectEspnLeague(userId, {
    leagueId: connection.leagueId,
    season: connection.season,
    teamId: connection.teamId ?? undefined,
    swid: connection.espnSwid ?? undefined,
    espnS2: connection.espnS2 ?? undefined,
  });
}
