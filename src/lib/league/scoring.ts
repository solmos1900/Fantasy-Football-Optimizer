/**
 * League scoring context for projections, trade value and copy.
 *
 * No league (NFL pool) = Full PPR, 1QB — the app's default board. Connected
 * leagues carry their own reception scoring and superflex flag (read from
 * ESPN mSettings or Sleeper league settings at sync).
 */

import type { LeagueData } from "@/lib/types";

export type ScoringFormat = "ppr" | "half_ppr" | "std";

export type LeagueScoring = {
  format: ScoringFormat;
  /** A slot can start a second QB (ESPN OP / Sleeper SUPER_FLEX). */
  superflex: boolean;
  /** Plain words for UI, e.g. "Half PPR · Superflex". */
  label: string;
};

export const FORMAT_LABEL: Record<ScoringFormat, string> = {
  ppr: "Full PPR",
  half_ppr: "Half PPR",
  std: "Standard",
};

export const DEFAULT_SCORING: LeagueScoring = {
  format: "ppr",
  superflex: false,
  label: FORMAT_LABEL.ppr,
};

/** Reception points → format (0.5 is half PPR; ≥0.75 counts as full). */
export function formatFromReceptionPoints(rec: number | null | undefined): ScoringFormat {
  const r = Number(rec ?? 0);
  if (r >= 0.75) return "ppr";
  if (r >= 0.25) return "half_ppr";
  return "std";
}

export function scoringLabel(
  format: ScoringFormat,
  superflex: boolean,
  extras: string[] = [],
): string {
  return [FORMAT_LABEL[format], ...(superflex ? ["Superflex"] : []), ...extras].join(" · ");
}

/** Scoring for a league payload; defaults (Full PPR, 1QB) when unknown. */
export function leagueScoring(
  league?: Pick<LeagueData, "scoringFormat" | "superflex" | "scoringLabel"> | null,
): LeagueScoring {
  if (!league?.scoringFormat) return DEFAULT_SCORING;
  const superflex = Boolean(league.superflex);
  return {
    format: league.scoringFormat,
    superflex,
    label: league.scoringLabel ?? scoringLabel(league.scoringFormat, superflex),
  };
}

/** "Full PPR, 1QB" / "Half PPR, Superflex" — for one-line notes. */
export function scoringBoardLabel(scoring: LeagueScoring): string {
  return `${FORMAT_LABEL[scoring.format]}, ${scoring.superflex ? "Superflex" : "1QB"}`;
}

// ── ESPN mSettings ────────────────────────────────────────────────────────

/** ESPN statId for receptions in scoringSettings.scoringItems. */
const ESPN_STAT_RECEPTIONS = 53;
/** ESPN lineup slot 7 = OP (offensive player) — a superflex slot. */
const ESPN_SLOT_OP = 7;

type EspnSettingsLike = {
  scoringSettings?: {
    scoringItems?: { statId?: number; points?: number }[];
  };
  rosterSettings?: {
    lineupSlotCounts?: Record<string, number>;
  };
};

/** Read reception scoring + superflex from an ESPN league `settings` blob. */
export function scoringFromEspnSettings(
  settings: EspnSettingsLike | null | undefined,
): Pick<LeagueData, "scoringFormat" | "superflex" | "scoringLabel"> | null {
  const items = settings?.scoringSettings?.scoringItems;
  if (!Array.isArray(items)) return null;
  const rec = items.find((i) => i.statId === ESPN_STAT_RECEPTIONS)?.points ?? 0;
  const format = formatFromReceptionPoints(rec);
  const superflex =
    Number(settings?.rosterSettings?.lineupSlotCounts?.[String(ESPN_SLOT_OP)] ?? 0) > 0;
  return { scoringFormat: format, superflex, scoringLabel: scoringLabel(format, superflex) };
}
