/**
 * Persist nflverse cron run history in EspnRawResponse (no schema migration).
 *
 * Sentinel: espnLeagueId="__nflverse_sync__", view="nflverse_sync", week=0.
 * Body holds a capped `runs[]` array (newest first) — same pattern as golden_check.
 */

import { prisma } from "@/lib/db";
import { defaultEspnSeason } from "@/lib/season";

export const NFLVERSE_SYNC_LEAGUE_ID = "__nflverse_sync__";
export const NFLVERSE_SYNC_VIEW = "nflverse_sync";
export const NFLVERSE_SYNC_MAX_RUNS = 10;

export type NflverseSourceFileMeta = {
  /** Short label, e.g. stats_player_week / snap_counts / players */
  name: string;
  url: string;
  /** HTTP Last-Modified (ISO) when available; else null — never invent. */
  lastModified: string | null;
  /** HTTP Date header fallback when Last-Modified is missing. */
  responseDate: string | null;
};

export type NflverseSyncRunRecord = {
  runAt: string;
  season: number;
  /** Latest REG week loaded this run (null if ingest failed before week pick). */
  week: number | null;
  sourceFiles: NflverseSourceFileMeta[];
  fetchedRows: number | null;
  upsertedRows: number | null;
  /** Golden fixture check outcome for this run. */
  goldenCheckOk: boolean | null;
  goldenCheckError: string | null;
  /** Week completeness vs ESPN scoreboard (null = could not assess). */
  weekComplete: boolean | null;
  missingTeams: string[] | null;
  /** True when DB latest week lags ESPN latest completed week. */
  stale: boolean | null;
  error: string | null;
};

type SyncLogBody = {
  kind: "nflverse_sync";
  runs: NflverseSyncRunRecord[];
};

function isSyncLogBody(raw: unknown): raw is SyncLogBody {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return o.kind === "nflverse_sync" && Array.isArray(o.runs);
}

export async function loadNflverseSyncRuns(options?: {
  season?: number;
  limit?: number;
}): Promise<NflverseSyncRunRecord[]> {
  const season = options?.season ?? defaultEspnSeason();
  const limit = options?.limit ?? NFLVERSE_SYNC_MAX_RUNS;
  const row = await prisma.espnRawResponse.findUnique({
    where: {
      espnLeagueId_season_view_week: {
        espnLeagueId: NFLVERSE_SYNC_LEAGUE_ID,
        season,
        view: NFLVERSE_SYNC_VIEW,
        week: 0,
      },
    },
  });
  if (!row?.body || !isSyncLogBody(row.body)) return [];
  return row.body.runs.slice(0, limit);
}

/** Append a run (newest first) and keep at most NFLVERSE_SYNC_MAX_RUNS. */
export async function persistNflverseSyncRun(
  run: NflverseSyncRunRecord,
): Promise<void> {
  const season = run.season;
  const existing = await loadNflverseSyncRuns({
    season,
    limit: NFLVERSE_SYNC_MAX_RUNS,
  });
  const runs = [run, ...existing].slice(0, NFLVERSE_SYNC_MAX_RUNS);
  const body: SyncLogBody = { kind: "nflverse_sync", runs };
  const fetchedAt = new Date(run.runAt);

  await prisma.espnRawResponse.upsert({
    where: {
      espnLeagueId_season_view_week: {
        espnLeagueId: NFLVERSE_SYNC_LEAGUE_ID,
        season,
        view: NFLVERSE_SYNC_VIEW,
        week: 0,
      },
    },
    create: {
      espnLeagueId: NFLVERSE_SYNC_LEAGUE_ID,
      season,
      view: NFLVERSE_SYNC_VIEW,
      week: 0,
      body,
      fetchedAt,
    },
    update: {
      body,
      fetchedAt,
    },
  });
}
