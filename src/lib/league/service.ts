import { prisma } from "@/lib/db";
import { createDemoLeague } from "@/lib/demo/seed";
import { fetchEspnLeague, type EspnCredentials } from "@/lib/espn/client";
import type { LeagueData } from "@/lib/types";

export async function getUserLeagueConnection(userId: string) {
  return prisma.leagueConnection.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getLeagueDataForUser(userId: string): Promise<LeagueData | null> {
  const connection = await getUserLeagueConnection(userId);
  if (!connection) return null;

  if (connection.cachedPayload) {
    try {
      return JSON.parse(connection.cachedPayload) as LeagueData;
    } catch {
      // fall through
    }
  }

  if (connection.isDemo) {
    const demo = createDemoLeague(connection.teamId ?? 1);
    await prisma.leagueConnection.update({
      where: { id: connection.id },
      data: {
        cachedPayload: JSON.stringify(demo),
        lastSyncedAt: new Date(),
        leagueName: demo.name,
      },
    });
    return demo;
  }

  return null;
}

export async function connectDemoLeague(userId: string): Promise<LeagueData> {
  const demo = createDemoLeague(1);
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
