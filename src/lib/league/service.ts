import { prisma } from "@/lib/db";
import { fetchEspnLeague, type EspnCredentials } from "@/lib/espn/client";
import {
  decryptEspnCookie,
  encryptEspnCookie,
  espnCookieUpdateFields,
} from "@/lib/espn/cookie-crypto";
import { refreshProjectionTrends } from "@/lib/insights/trends";
import {
  applyUserTeamId,
  resolvePersistedTeamId,
} from "@/lib/league/team";
import type { FantasyPlayer, LeagueData } from "@/lib/types";

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

/**
 * Cookie columns for LeagueConnection upsert `update`.
 *
 * Sync must omit cookies entirely so a mid-flight reconnect cannot be rolled
 * back when Sync finishes with the cookies it read at start (issue #105).
 * Connect still spreads espnCookieUpdateFields (blank = keep prior, #44).
 */
export function leagueConnectionCookieUpdateFields(input: {
  persistCookies: boolean;
  swid?: string | null;
  espnS2?: string | null;
}): { espnSwid?: string | null; espnS2?: string | null } {
  if (!input.persistCookies) return {};
  return espnCookieUpdateFields({ swid: input.swid, espnS2: input.espnS2 });
}

/** Prior free agents from a stored cachedPayload, if parseable. */
export function freeAgentsFromCachedPayload(
  cachedPayload: string | null | undefined,
): FantasyPlayer[] | undefined {
  if (!cachedPayload) return undefined;
  try {
    const cached = JSON.parse(cachedPayload) as LeagueData;
    if (!Array.isArray(cached.freeAgents)) return undefined;
    return cached.freeAgents;
  } catch {
    return undefined;
  }
}

const COOKIE_DECRYPT_HINT =
  "Then set ESPN_COOKIE_ENCRYPTION_KEY in Vercel → Project → Settings → Environment Variables (Production), redeploy, and Sync again — or reconnect the league with fresh SWID + espn_s2.";

/**
 * Resolve SWID / espn_s2 for an ESPN fetch.
 *
 * Non-blank submitted values win. When a field is blank, decrypt the matching
 * column from the same (userId, leagueId, season) connection row — the only
 * scope cookies are stored under — so Connect with blank fields matches Sync
 * (issue #104). Public leagues (no stored cookies) stay unaffected.
 */
export function resolveEspnFetchCookies(input: {
  swid?: string | null;
  espnS2?: string | null;
  stored?: { espnSwid: string | null; espnS2: string | null } | null;
}): { swid?: string; espnS2?: string } {
  const submittedSwid = input.swid?.trim() || undefined;
  const submittedS2 = input.espnS2?.trim() || undefined;

  let storedSwid: string | undefined;
  let storedS2: string | undefined;
  if (input.stored && (!submittedSwid || !submittedS2)) {
    try {
      if (!submittedSwid) {
        storedSwid = decryptEspnCookie(input.stored.espnSwid) ?? undefined;
      }
      if (!submittedS2) {
        storedS2 = decryptEspnCookie(input.stored.espnS2) ?? undefined;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message} ${COOKIE_DECRYPT_HINT}`);
    }
  }

  return {
    swid: submittedSwid ?? storedSwid,
    espnS2: submittedS2 ?? storedS2,
  };
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
    /**
     * When false (Sync), do not rewrite ESPN cookie columns.
     * Default true for Connect / reconnect.
     */
    persistCookies?: boolean;
  },
): Promise<LeagueData> {
  const leagueId = input.leagueId.trim();
  const season = input.season;
  const persistCookies = input.persistCookies !== false;

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

  // Blank Connect fields reuse saved cookies for this league/season only (#104).
  // Newly typed cookies still take precedence; upsert blank-preserve (#44) unchanged.
  const cookies = resolveEspnFetchCookies({
    swid: input.swid,
    espnS2: input.espnS2,
    stored: existing,
  });

  const creds: EspnCredentials = {
    leagueId,
    season,
    teamId: resolvedTeamId ?? undefined,
    swid: cookies.swid,
    espnS2: cookies.espnS2,
  };

  const fetched = await fetchEspnLeague(creds, {
    bypassCache: Boolean(input.bypassCache),
    fallbackFreeAgents: freeAgentsFromCachedPayload(existing?.cachedPayload),
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
      // Blank cookie fields must not wipe stored encrypted values (issue #44).
      // Use submitted input here — not fetch-resolved creds — so blank Connect
      // that reused saved cookies for the ESPN call still omits cookie columns.
      // Sync omits cookie columns so newer reconnect cookies are not clobbered (#105).
      ...leagueConnectionCookieUpdateFields({
        persistCookies,
        swid: input.swid,
        espnS2: input.espnS2,
      }),
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

  // Cookies omitted: connectEspnLeague decrypts from this league/season row
  // for the fetch (#104). persistCookies: false so Sync never writes them
  // back (a mid-flight reconnect with rotated cookies must not be overwritten — #105).
  return connectEspnLeague(userId, {
    leagueId: connection.leagueId,
    season: connection.season,
    teamId: connection.teamId ?? undefined,
    bypassCache: true,
    persistCookies: false,
  });
}
