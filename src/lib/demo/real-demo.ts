/**
 * Real read-only demo league — backed by an owner's ESPN LeagueConnection.
 *
 * Privacy:
 * - Guests never receive espnSwid / espnS2 (not copied onto their row).
 * - Refresh decrypts cookies only in-process on the source row.
 * - Guest wipe / TTL cleanup still cascades the guest's LeagueConnection only.
 */

import { prisma } from "@/lib/db";
import {
  demoLeagueConnectionIdFromEnv,
  demoLeagueSyncTtlMsFromEnv,
  isFabricatedSeedLeague,
} from "@/lib/demo/config";
import { applyDemoOwnerDisplayName } from "@/lib/demo/seed";
import { fetchEspnLeague, type EspnCredentials } from "@/lib/espn/client";
import { decryptEspnCookie } from "@/lib/espn/cookie-crypto";
import { refreshProjectionTrends } from "@/lib/insights/trends";
import type { LeagueData } from "@/lib/types";

export class DemoLeagueNotConfiguredError extends Error {
  constructor(message = "Demo league is not configured.") {
    super(message);
    this.name = "DemoLeagueNotConfiguredError";
  }
}

async function persistTrendsForRealLeague(league: LeagueData): Promise<void> {
  if (isFabricatedSeedLeague(league)) return;
  try {
    await refreshProjectionTrends(league);
  } catch (err) {
    console.error("[trends] demo-source refresh failed", err);
  }
}

function parseCachedPayload(raw: string | null | undefined): LeagueData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LeagueData;
    if (!parsed?.leagueId || !Array.isArray(parsed.teams)) return null;
    if (isFabricatedSeedLeague(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Even explicit Sync waits at least this long between ESPN hits on the shared source. */
const DEMO_FORCE_REFRESH_FLOOR_MS = 2 * 60 * 1000;

function needsEspnRefresh(
  lastSyncedAt: Date | null | undefined,
  forceRefresh: boolean,
  now = Date.now(),
): boolean {
  if (!lastSyncedAt) return true;
  const age = now - lastSyncedAt.getTime();
  if (forceRefresh) return age > DEMO_FORCE_REFRESH_FLOOR_MS;
  return age > demoLeagueSyncTtlMsFromEnv();
}

/**
 * Sanitize a live ESPN payload for demo viewers.
 * Marks isDemo for UI chrome; never invents players or points.
 */
export function sanitizeDemoLeagueForViewer(
  league: LeagueData,
  ownerDisplayName?: string | null,
): LeagueData {
  const base: LeagueData = {
    ...league,
    isDemo: true,
    // Ensure no accidental cookie-shaped fields if payload ever grows.
  };
  return applyDemoOwnerDisplayName(base, ownerDisplayName);
}

async function loadSourceConnection() {
  const id = demoLeagueConnectionIdFromEnv();
  if (!id) {
    throw new DemoLeagueNotConfiguredError(
      "Demo league is not configured. Set DEMO_LEAGUE_CONNECTION_ID to a live ESPN LeagueConnection id.",
    );
  }

  const source = await prisma.leagueConnection.findUnique({
    where: { id },
  });

  if (!source) {
    throw new DemoLeagueNotConfiguredError(
      "DEMO_LEAGUE_CONNECTION_ID does not match any LeagueConnection.",
    );
  }

  if (source.isDemo) {
    throw new DemoLeagueNotConfiguredError(
      "DEMO_LEAGUE_CONNECTION_ID must point at a live ESPN connection (not a demo row).",
    );
  }

  return source;
}

/**
 * Refresh the owner's source connection via ESPN (server-side cookies only).
 * Updates that row in place — never writes cookies onto guest rows.
 */
export async function refreshDemoSourceConnection(): Promise<LeagueData> {
  const source = await loadSourceConnection();

  let swid: string | undefined;
  let espnS2: string | undefined;
  try {
    swid = decryptEspnCookie(source.espnSwid) ?? undefined;
    espnS2 = decryptEspnCookie(source.espnS2) ?? undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Demo source cookies could not be decrypted. ${message}`,
    );
  }

  const creds: EspnCredentials = {
    leagueId: source.leagueId,
    season: source.season,
    teamId: source.teamId ?? undefined,
    swid,
    espnS2,
  };

  const league = await fetchEspnLeague(creds, { bypassCache: true });

  if (source.teamId) {
    league.userTeamId = source.teamId;
    league.teams = league.teams.map((t) => ({
      ...t,
      isCurrentUser: t.id === source.teamId,
    }));
  }

  const syncedAt = new Date();
  league.lastSyncedAt = syncedAt.toISOString();

  await prisma.leagueConnection.update({
    where: { id: source.id },
    data: {
      cachedPayload: JSON.stringify(league),
      lastSyncedAt: syncedAt,
      leagueName: league.name,
      // Cookies stay on the source row only; left untouched here.
    },
  });

  await persistTrendsForRealLeague(league);
  return league;
}

/**
 * Serve demo league data from Neon first; ESPN sync only when source is stale
 * (or forceRefresh on explicit Sync).
 */
export async function getFreshDemoSourceLeague(options?: {
  forceRefresh?: boolean;
}): Promise<LeagueData> {
  const source = await loadSourceConnection();
  const cached = parseCachedPayload(source.cachedPayload);
  const force = Boolean(options?.forceRefresh);

  if (cached && !needsEspnRefresh(source.lastSyncedAt, force)) {
    return {
      ...cached,
      lastSyncedAt:
        source.lastSyncedAt?.toISOString() ?? cached.lastSyncedAt,
      isDemo: false,
    };
  }

  // Stale / forced / missing cache → ESPN via existing fetch path.
  try {
    return await refreshDemoSourceConnection();
  } catch (err) {
    // Fail soft when we still have a real Neon snapshot.
    if (cached) {
      console.error(
        "[demo] ESPN refresh failed; serving stale Neon snapshot",
        err,
      );
      return {
        ...cached,
        lastSyncedAt:
          source.lastSyncedAt?.toISOString() ?? cached.lastSyncedAt,
        isDemo: false,
      };
    }
    throw err;
  }
}

export function demoNotConfiguredMessage(): string {
  return "Demo league is not configured yet. An admin must set DEMO_LEAGUE_CONNECTION_ID to a live ESPN league connection.";
}
