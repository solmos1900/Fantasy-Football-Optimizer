import { prisma } from "@/lib/db";
import { isFabricatedSeedLeague } from "@/lib/demo/config";
import {
  DemoLeagueNotConfiguredError,
  demoNotConfiguredMessage,
  getFreshDemoSourceLeague,
  sanitizeDemoLeagueForViewer,
} from "@/lib/demo/real-demo";
import { fetchEspnLeague, type EspnCredentials } from "@/lib/espn/client";
import {
  decryptEspnCookie,
  encryptEspnCookie,
} from "@/lib/espn/cookie-crypto";
import { refreshProjectionTrends } from "@/lib/insights/trends";
import type { LeagueData } from "@/lib/types";

async function persistTrendsSafe(league: LeagueData): Promise<void> {
  // Fabricated seed is regenerable in-memory — skip Neon writes.
  // Real demo (shared ESPN leagueId) should persist so guests share trends.
  if (isFabricatedSeedLeague(league)) return;
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

/** Prefer DB lastSyncedAt when hydrating a cached ESPN payload for the UI. */
export function applyConnectionLastSyncedAt(
  cached: LeagueData,
  connectionLastSyncedAt: Date | null | undefined,
): LeagueData {
  const lastSyncedAt =
    connectionLastSyncedAt?.toISOString() ?? cached.lastSyncedAt;
  return { ...cached, lastSyncedAt };
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

/**
 * Persist a read-only demo snapshot onto the viewer's LeagueConnection.
 * Never copies ESPN cookies. Guests keep a Neon cache so page loads stay fast;
 * freshness is driven by the shared DEMO_LEAGUE_CONNECTION_ID source TTL.
 */
async function upsertViewerDemoConnection(
  userId: string,
  view: LeagueData,
): Promise<void> {
  await prisma.leagueConnection.upsert({
    where: {
      userId_leagueId_season: {
        userId,
        leagueId: view.leagueId,
        season: view.season,
      },
    },
    update: {
      isDemo: true,
      teamId: view.userTeamId ?? null,
      leagueName: view.name,
      espnSwid: null,
      espnS2: null,
      cachedPayload: JSON.stringify(view),
      lastSyncedAt: view.lastSyncedAt
        ? new Date(view.lastSyncedAt)
        : new Date(),
    },
    create: {
      userId,
      leagueId: view.leagueId,
      season: view.season,
      teamId: view.userTeamId ?? null,
      leagueName: view.name,
      isDemo: true,
      espnSwid: null,
      espnS2: null,
      cachedPayload: JSON.stringify(view),
      lastSyncedAt: view.lastSyncedAt
        ? new Date(view.lastSyncedAt)
        : new Date(),
    },
  });
}

export async function getLeagueDataForUser(
  userId: string,
): Promise<LeagueData | null> {
  const connection = await getUserLeagueConnection(userId);
  if (!connection) return null;

  const ownerName = connection.isDemo
    ? await demoOwnerDisplayName(userId)
    : null;

  if (connection.isDemo) {
    // Real shared demo: serve Neon first, refresh source when TTL expired.
    try {
      const fresh = await getFreshDemoSourceLeague();
      const view = sanitizeDemoLeagueForViewer(fresh, ownerName);
      try {
        await upsertViewerDemoConnection(userId, view);
      } catch (err) {
        console.error("[league] failed to persist viewer demo cache", err);
      }
      return view;
    } catch (err) {
      // Honest fallback: viewer Neon snapshot if it is real (never re-seed).
      if (connection.cachedPayload) {
        try {
          const cached = JSON.parse(connection.cachedPayload) as LeagueData;
          if (!isFabricatedSeedLeague(cached) && cached.teams?.length) {
            console.error(
              "[league] demo source unavailable; serving viewer cache",
              err,
            );
            return sanitizeDemoLeagueForViewer(
              applyConnectionLastSyncedAt(cached, connection.lastSyncedAt),
              ownerName,
            );
          }
        } catch {
          // fall through
        }
      }
      if (err instanceof DemoLeagueNotConfiguredError) {
        console.error("[league]", err.message);
        return null;
      }
      console.error("[league] demo hydrate failed", err);
      return null;
    }
  }

  if (connection.cachedPayload) {
    try {
      const cached = JSON.parse(connection.cachedPayload) as LeagueData;
      // Never resurrect fabricated seed payloads for product users.
      if (isFabricatedSeedLeague(cached)) {
        return null;
      }
      return applyConnectionLastSyncedAt(cached, connection.lastSyncedAt);
    } catch {
      // fall through
    }
  }

  return null;
}

export async function connectDemoLeague(
  userId: string,
  options?: { forceRefresh?: boolean },
): Promise<LeagueData> {
  const { name: ownerName } = await userFlags(userId);

  let fresh: LeagueData;
  try {
    fresh = await getFreshDemoSourceLeague({
      forceRefresh: Boolean(options?.forceRefresh),
    });
  } catch (err) {
    if (err instanceof DemoLeagueNotConfiguredError) {
      throw new Error(demoNotConfiguredMessage());
    }
    throw err;
  }

  const view = sanitizeDemoLeagueForViewer(fresh, ownerName);
  await upsertViewerDemoConnection(userId, view);
  await persistTrendsSafe(view);
  return view;
}

export async function connectEspnLeague(
  userId: string,
  input: {
    leagueId: string;
    season: number;
    teamId?: number;
    swid?: string;
    espnS2?: string;
    /** Explicit Sync league — bypass Next Data Cache on ESPN reads. */
    bypassCache?: boolean;
  },
): Promise<LeagueData> {
  const creds: EspnCredentials = {
    leagueId: input.leagueId.trim(),
    season: input.season,
    teamId: input.teamId,
    swid: input.swid?.trim() || undefined,
    espnS2: input.espnS2?.trim() || undefined,
  };

  const league = await fetchEspnLeague(creds, {
    bypassCache: Boolean(input.bypassCache),
  });

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
    // Explicit Sync: bypass TTL and refresh the shared source, then re-copy.
    return connectDemoLeague(userId, { forceRefresh: true });
  }

  // Decrypt only for the ESPN fetch path; next write re-encrypts at rest.
  // Missing/wrong ESPN_COOKIE_ENCRYPTION_KEY fails closed here — surface that
  // to the client instead of leaving Last sync frozen on a silent failure.
  let swid: string | undefined;
  let espnS2: string | undefined;
  try {
    swid = decryptEspnCookie(connection.espnSwid) ?? undefined;
    espnS2 = decryptEspnCookie(connection.espnS2) ?? undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${message} Then set ESPN_COOKIE_ENCRYPTION_KEY in Vercel → Project → Settings → Environment Variables (Production), redeploy, and Sync again — or reconnect the league with fresh SWID + espn_s2.`,
    );
  }

  return connectEspnLeague(userId, {
    leagueId: connection.leagueId,
    season: connection.season,
    teamId: connection.teamId ?? undefined,
    swid,
    espnS2,
    bypassCache: true,
  });
}
