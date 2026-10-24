/**
 * One-time purge of guest-pool ESPN-sourced actual points (#147).
 *
 * After #141 (data version 2), the ESPN gamelog gap-fill in the same cron
 * re-wrote empty actualPpr values with actualSource=espn_category. Product
 * rule: nflverse is the ONLY source of actual fantasy points on leagueId="";
 * ESPN is injuries + ownership only.
 *
 * This runner clears those leftovers once (version stamp), logs before/after
 * counts, and leaves gaps empty until the next nflverse ingest fills them.
 * It never touches nflverse_ppr rows.
 *
 * Kill-switch: DATA_REBUILD_DISABLED=1 (same as the #141 rebuild).
 */

import { prisma } from "@/lib/db";
import {
  DATA_REBUILD_DISABLED_ENV,
  clearEspnCategoryActuals,
  countEspnCategoryActuals,
  resolveNflverseActualsRebuildMode,
  type NflverseActualsRebuildMode,
} from "@/lib/nflverse/actuals-rebuild";
import { defaultEspnSeason } from "@/lib/season";

/** Bump if a future cleanup must re-run after this version completed. */
export const ESPN_CATEGORY_CLEANUP_VERSION = 1;

/** Reuse the rebuild stamp league id; distinct view name. */
export const ESPN_CATEGORY_CLEANUP_LEAGUE_ID = "__nflverse_rebuild__";
export const ESPN_CATEGORY_CLEANUP_VIEW = "espn_category_actuals_cleanup";

export type EspnCategoryCleanupStamp = {
  kind: "espn_category_actuals_cleanup";
  appliedVersion: number;
  lastRunAt: string | null;
  lastBeforeCount: number | null;
  lastAfterCount: number | null;
  lastCleared: number | null;
};

export type EspnCategoryCleanupResult = {
  mode: NflverseActualsRebuildMode;
  season: number;
  targetVersion: number;
  appliedVersionBefore: number;
  appliedVersionAfter: number;
  skipped: boolean;
  skipReason: string | null;
  complete: boolean;
  beforeCount: number;
  afterCount: number;
  cleared: number;
};

function emptyStamp(): EspnCategoryCleanupStamp {
  return {
    kind: "espn_category_actuals_cleanup",
    appliedVersion: 0,
    lastRunAt: null,
    lastBeforeCount: null,
    lastAfterCount: null,
    lastCleared: null,
  };
}

function isStampBody(raw: unknown): raw is EspnCategoryCleanupStamp {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    o.kind === "espn_category_actuals_cleanup" &&
    typeof o.appliedVersion === "number"
  );
}

export async function loadEspnCategoryCleanupStamp(options?: {
  season?: number;
}): Promise<EspnCategoryCleanupStamp> {
  const season = options?.season ?? defaultEspnSeason();
  const row = await prisma.espnRawResponse.findUnique({
    where: {
      espnLeagueId_season_view_week: {
        espnLeagueId: ESPN_CATEGORY_CLEANUP_LEAGUE_ID,
        season,
        view: ESPN_CATEGORY_CLEANUP_VIEW,
        week: 0,
      },
    },
  });
  if (row?.body && isStampBody(row.body)) {
    return { ...emptyStamp(), ...row.body };
  }
  return emptyStamp();
}

async function persistStamp(
  season: number,
  body: EspnCategoryCleanupStamp,
): Promise<void> {
  const fetchedAt = new Date(body.lastRunAt ?? Date.now());
  await prisma.espnRawResponse.upsert({
    where: {
      espnLeagueId_season_view_week: {
        espnLeagueId: ESPN_CATEGORY_CLEANUP_LEAGUE_ID,
        season,
        view: ESPN_CATEGORY_CLEANUP_VIEW,
        week: 0,
      },
    },
    create: {
      espnLeagueId: ESPN_CATEGORY_CLEANUP_LEAGUE_ID,
      season,
      view: ESPN_CATEGORY_CLEANUP_VIEW,
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

export type RunEspnCategoryCleanupOptions = {
  season: number;
  /** Override env resolution (tests / CLI). */
  mode?: NflverseActualsRebuildMode;
  /** Target cleanup version (default ESPN_CATEGORY_CLEANUP_VERSION). */
  targetVersion?: number;
};

/**
 * Idempotent cleanup step for cron.
 * Default mode=apply. Kill-switch → disabled no-op.
 * Already at target version → skip (even if new espn_category rows appear;
 * gap-fill must stay removed so that cannot happen).
 */
export async function runEspnCategoryActualsCleanup(
  options: RunEspnCategoryCleanupOptions,
): Promise<EspnCategoryCleanupResult> {
  const mode = options.mode ?? resolveNflverseActualsRebuildMode();
  const targetVersion =
    options.targetVersion ?? ESPN_CATEGORY_CLEANUP_VERSION;
  const stamp = await loadEspnCategoryCleanupStamp({ season: options.season });
  const appliedBefore = stamp.appliedVersion;

  if (mode === "disabled") {
    return {
      mode,
      season: options.season,
      targetVersion,
      appliedVersionBefore: appliedBefore,
      appliedVersionAfter: appliedBefore,
      skipped: true,
      skipReason: "data_rebuild_disabled",
      complete: appliedBefore >= targetVersion,
      beforeCount: 0,
      afterCount: 0,
      cleared: 0,
    };
  }

  if (appliedBefore >= targetVersion) {
    return {
      mode,
      season: options.season,
      targetVersion,
      appliedVersionBefore: appliedBefore,
      appliedVersionAfter: appliedBefore,
      skipped: true,
      skipReason: "already_at_version",
      complete: true,
      beforeCount: 0,
      afterCount: 0,
      cleared: 0,
    };
  }

  const beforeCount = await countEspnCategoryActuals({
    season: options.season,
  });
  console.info(
    "[espn-category-cleanup] before",
    JSON.stringify({
      season: options.season,
      targetVersion,
      espnCategoryRows: beforeCount,
      killSwitch: DATA_REBUILD_DISABLED_ENV,
    }),
  );

  const cleared =
    beforeCount > 0
      ? await clearEspnCategoryActuals({ season: options.season })
      : 0;

  const afterCount = await countEspnCategoryActuals({
    season: options.season,
  });
  console.info(
    "[espn-category-cleanup] after",
    JSON.stringify({
      season: options.season,
      targetVersion,
      espnCategoryRows: afterCount,
      cleared,
    }),
  );

  const appliedAfter = targetVersion;
  await persistStamp(options.season, {
    kind: "espn_category_actuals_cleanup",
    appliedVersion: appliedAfter,
    lastRunAt: new Date().toISOString(),
    lastBeforeCount: beforeCount,
    lastAfterCount: afterCount,
    lastCleared: cleared,
  });

  return {
    mode,
    season: options.season,
    targetVersion,
    appliedVersionBefore: appliedBefore,
    appliedVersionAfter: appliedAfter,
    skipped: false,
    skipReason: null,
    complete: true,
    beforeCount,
    afterCount,
    cleared,
  };
}
