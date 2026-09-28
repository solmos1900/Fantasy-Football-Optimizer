import { prisma } from "@/lib/db";
import {
  applyDemoOwnerDisplayName,
  createDemoLeague,
} from "@/lib/demo/seed";
import { fetchEspnLeague, type EspnCredentials } from "@/lib/espn/client";
import {
  decryptEspnCookie,
  encryptEspnCookie,
} from "@/lib/espn/cookie-crypto";
import { refreshProjectionTrends } from "@/lib/insights/trends";
import type { LeagueData } from "@/lib/types";

async function persistTrendsSafe(league: LeagueData): Promise<void> {
  // Demo seed is fully regenerable in-memory — skip Neon writes (shared
  // leagueId "demo-league" would only churn upserts for every guest visit).
  if (league.isDemo) return;
  try {
    await refreshProjectionTrends(league);
  } catch (err) {
    // Trends are best-effort — never block sync if Neon is briefly unavailable
    console.error("[trends] refresh failed", err);
  }
}

async function userFlags(userId: string): Promise<{
  name: string | null;
  isGuest: boolean;
}> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, isGuest: true },
    });
    return { name: user?.name ?? null, isGuest: Boolean(user?.isGuest) };
  } catch (err) {
    console.error("[league] userFlags failed", err);
    return { name: null, isGuest: false };
  }
}

async function demoOwnerDisplayName(userId: string): Promise<string | null> {
  const { name } = await userFlags(userId);
  return name;
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
    const { isGuest } = await userFlags(userId);
    // Guests: keep a slim connection row (no JSON blob). Seed regenerates fast.
    // Signed-in demo users: cache payload so Insights stays snappy offline of seed changes.
    if (!isGuest) {
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
    } else if (connection.leagueName !== demo.name) {
      try {
        await prisma.leagueConnection.update({
          where: { id: connection.id },
          data: { leagueName: demo.name, lastSyncedAt: new Date() },
        });
      } catch (err) {
        console.error("[league] failed to touch guest demo connection", err);
      }
    }
    await persistTrendsSafe(demo);
    return demo;
  }

  return null;
}

export async function connectDemoLeague(userId: string): Promise<LeagueData> {
  const { name: ownerName, isGuest } = await userFlags(userId);
  const demo = createDemoLeague(1, { ownerDisplayName: ownerName });
  // Guests skip cachedPayload — wipe on session end; avoid storing demo JSON per visit.
  const payload = isGuest ? null : JSON.stringify(demo);
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
      cachedPayload: payload,
      lastSyncedAt: new Date(),
    },
    create: {
      userId,
      leagueId: demo.leagueId,
      season: demo.season,
      teamId: 1,
      leagueName: demo.name,
      isDemo: true,
      cachedPayload: payload,
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
      espnSwid: encryptEspnCookie(creds.swid),
      espnS2: encryptEspnCookie(creds.espnS2),
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
      espnSwid: encryptEspnCookie(creds.swid),
      espnS2: encryptEspnCookie(creds.espnS2),
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

  // Decrypt only for the ESPN fetch path; next write re-encrypts at rest.
  return connectEspnLeague(userId, {
    leagueId: connection.leagueId,
    season: connection.season,
    teamId: connection.teamId ?? undefined,
    swid: decryptEspnCookie(connection.espnSwid) ?? undefined,
    espnS2: decryptEspnCookie(connection.espnS2) ?? undefined,
  });
}
