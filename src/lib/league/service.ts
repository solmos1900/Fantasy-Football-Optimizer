import { prisma } from "@/lib/db";
import { fetchEspnLeague, type EspnCredentials } from "@/lib/espn/client";
import {
  decryptEspnCookie,
  encryptEspnCookie,
} from "@/lib/espn/cookie-crypto";
import { refreshProjectionTrends } from "@/lib/insights/trends";
import {
  applyUserTeamId,
  resolvePersistedTeamId,
} from "@/lib/league/team";
import type { LeagueData } from "@/lib/types";

export {
  applyUserTeamId,
  resolvePersistedTeamId,
  resolveUserTeam,
} from "@/lib/league/team";

async function persistTrendsSafe(league: LeagueData): Promise<void> {
  try {
    await refreshProjectionTrends(league);
  } catch (err) {
    // Trends are best-effort — never block sync if Neon is briefly unavailable
    console.error("[trends] refresh failed", err);
  }
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
      where: { userId, isDemo: false },
      orderBy: { updatedAt: "desc" },
    });
  } catch (err) {
    // Never take down app chrome after guest/auth — empty state is recoverable.
    console.error("[league] getUserLeagueConnection failed", err);
    return null;
  }
}

export async function getLeagueDataForUser(
  userId: string,
): Promise<LeagueData | null> {
  const connection = await getUserLeagueConnection(userId);
  if (!connection) return null;

  // Ignore legacy demo / seed rows — product path is ESPN only.
  if (connection.isDemo) return null;

  if (connection.cachedPayload) {
    try {
      const cached = JSON.parse(connection.cachedPayload) as LeagueData;
      if (cached.isDemo || cached.leagueId === "demo-league") return null;
      // DB teamId is source of truth — never trust a stale/cleared payload alone.
      return applyUserTeamId(
        applyConnectionLastSyncedAt(cached, connection.lastSyncedAt),
        connection.teamId,
      );
    } catch {
      // fall through
    }
  }

  return null;
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
  const leagueId = input.leagueId.trim();
  const season = input.season;

  const existing = await prisma.leagueConnection.findUnique({
    where: {
      userId_leagueId_season: {
        userId,
        leagueId,
        season,
      },
    },
  });

  // Reconnect without a team ID must keep the previously saved team.
  const resolvedTeamId = resolvePersistedTeamId(
    input.teamId,
    existing?.teamId,
  );

  const creds: EspnCredentials = {
    leagueId,
    season,
    teamId: resolvedTeamId ?? undefined,
    swid: input.swid?.trim() || undefined,
    espnS2: input.espnS2?.trim() || undefined,
  };

  const fetched = await fetchEspnLeague(creds, {
    bypassCache: Boolean(input.bypassCache),
  });
  const league = applyUserTeamId(fetched, resolvedTeamId);

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
      teamId: resolvedTeamId,
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
      teamId: resolvedTeamId,
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
    throw new Error(
      "Demo leagues are no longer supported. Connect an ESPN league instead.",
    );
  }

  // Decrypt only for the ESPN fetch path; next write re-encrypts at rest.
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
