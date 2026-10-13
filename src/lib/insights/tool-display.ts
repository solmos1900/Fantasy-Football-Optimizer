/**
 * Shared Trade Analyzer / Who to Start display helpers — Insights parity.
 *
 * Full name + team, nflverse week PPR strips, labeled Sleeper proj,
 * DVP matchup with @/vs + fantasy impact, injury tags. No Opp/TGT%/szn jargon.
 */

import {
  buildDefenseVsPositionMap,
  dvpForPlayer,
  type DvpChip,
} from "@/lib/insights/defense-vs-position";
import {
  fetchSleeperProjections,
  sleeperProjForPlayer,
  type SleeperProjectionMap,
} from "@/lib/sleeper/projections";
import { fetchNflWeekSnapshot } from "@/lib/players/week";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import { formatStatusCode, injuryStatusPhrase } from "@/lib/utils";
import type {
  FantasyPlayer,
  InjuryStatus,
  PlayerPosition,
} from "@/lib/types";
import type { WeekPointCell } from "@/lib/insights/roster-signals";
import type { TeammateInjuryImpact } from "@/lib/insights/teammate-injury";

export type ToolDisplayMeta = {
  season: number;
  currentWeek: number;
  statsThroughWeek: number;
  weekAxis: number[];
  /** "DEF|POS" → DvpChip (JSON-safe). */
  dvpByKey: Record<string, DvpChip>;
  /** espnId string → Sleeper full-PPR proj (null omitted). */
  sleeperByEspnId: Record<string, number>;
  sleeperEmpty: boolean;
  maxPts: number;
};

export type ToolPlayerCard = {
  player: FantasyPlayer;
  label: string;
  weeks: WeekPointCell[];
  matchup: DvpChip | null;
  sleeperProj: number | null;
  /** e.g. "Projected 15.3 this week (Sleeper)" */
  sleeperLine: string;
  /** Last 3 vs season form with fantasy impact. */
  formLine: string | null;
  injuryTag: string | null;
  injuryNote: string | null;
  byeThisWeek: boolean;
};

function mean(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Build week cells from player.recentWeeks (nflverse full PPR) + Sleeper proj. */
export function weekCellsFromPlayer(options: {
  player: FantasyPlayer;
  currentWeek: number;
  statsThroughWeek: number;
  sleeperProj: number | null;
}): WeekPointCell[] {
  const { player, currentWeek, statsThroughWeek, sleeperProj } = options;
  const byWeek = new Map<number, { pts: number | null; opp?: string }>();

  for (const w of player.recentWeeks ?? []) {
    if (w.week < 1 || w.week > statsThroughWeek) continue;
    const pts =
      typeof w.points === "number" && Number.isFinite(w.points)
        ? Math.round(w.points * 10) / 10
        : null;
    byWeek.set(w.week, {
      pts,
      opp: w.opponent ?? undefined,
    });
  }

  const cells: WeekPointCell[] = [];
  for (let week = 1; week <= currentWeek; week++) {
    if (week > statsThroughWeek) {
      const bye = (player.opponent ?? "").toUpperCase() === "BYE";
      cells.push(
        bye
          ? { week, kind: "bye", value: null }
          : { week, kind: "proj", value: sleeperProj },
      );
      continue;
    }
    const known = byWeek.get(week);
    const opp = (known?.opp ?? "").toUpperCase();
    if (opp === "BYE") {
      cells.push({ week, kind: "bye", value: null });
      continue;
    }
    if (known && known.pts != null) {
      cells.push({ week, kind: "played", value: known.pts });
      continue;
    }
    // Missing completed week → empty (—), never fake 0
    cells.push({ week, kind: "empty", value: null });
  }
  return cells;
}

export function formImpactLine(player: FantasyPlayer): string | null {
  const weeks = [...(player.recentWeeks ?? [])]
    .filter((w) => typeof w.points === "number" && Number.isFinite(w.points))
    .sort((a, b) => b.week - a.week);
  if (weeks.length < 2) return null;
  const last3 = weeks.slice(0, 3).map((w) => w.points);
  const season = weeks.map((w) => w.points);
  const avg3 = mean(last3);
  const seasonAvg = mean(season);
  if (avg3 == null || seasonAvg == null || seasonAvg === 0) return null;
  const pct = (avg3 - seasonAvg) / Math.abs(seasonAvg);
  const dir =
    pct >= 0.15
      ? "trending up"
      : pct <= -0.15
        ? "trending down"
        : "holding steady";
  return `Last 3 games avg ${avg3.toFixed(1)} vs season ${seasonAvg.toFixed(1)}: ${dir}`;
}

export function injuryTagFor(status: InjuryStatus): string | null {
  const code = formatStatusCode(status);
  if (code === "ACTIVE" || code === "UNKNOWN") return null;
  if (code === "QUESTIONABLE") return "Q";
  if (code === "DOUBTFUL") return "D";
  if (code === "OUT") return "O";
  if (code === "IR") return "IR";
  if (code === "SUSPENSION") return "SUS";
  return code;
}

export function injuryNoteFor(player: FantasyPlayer): string | null {
  if (player.injuryStatus === "ACTIVE") return null;
  const who = formatPlayerLabel(player.name, player.nflTeam);
  const phrase = injuryStatusPhrase(player.injuryStatus, "listed");
  return `${who} is ${phrase} (from roster sync — Gridiron IQ does not invent injury details).`;
}

export function sleeperProjLine(proj: number | null): string {
  if (proj == null || !Number.isFinite(proj)) {
    return "Projected — this week (Sleeper)";
  }
  return `Projected ${proj.toFixed(1)} this week (Sleeper)`;
}

export function dvpMapToRecord(
  map: Map<string, DvpChip>,
): Record<string, DvpChip> {
  const out: Record<string, DvpChip> = {};
  for (const [k, v] of map) out[k] = v;
  return out;
}

export function dvpMapFromRecord(
  record: Record<string, DvpChip> | undefined,
): Map<string, DvpChip> {
  const map = new Map<string, DvpChip>();
  if (!record) return map;
  for (const [k, v] of Object.entries(record)) map.set(k, v);
  return map;
}

/**
 * Load DVP + Sleeper meta shared by Trade / Who to Start (server).
 * Week strips still come from each player's recentWeeks (nflverse full PPR).
 */
export async function loadToolDisplayMeta(options: {
  season: number;
  players: FantasyPlayer[];
}): Promise<ToolDisplayMeta> {
  const weekSnap = await fetchNflWeekSnapshot(options.season).catch(() => null);
  const currentWeek =
    weekSnap?.currentWeek ??
    Math.max(
      1,
      ...options.players.flatMap((p) =>
        (p.recentWeeks ?? []).map((w) => w.week),
      ),
      1,
    );
  const statsThroughWeek =
    weekSnap?.latestCompletedWeek ?? Math.max(0, currentWeek - 1);

  const [dvpMap, sleeper] = await Promise.all([
    buildDefenseVsPositionMap({
      season: options.season,
      throughWeek: Math.max(statsThroughWeek, 0),
      lookback: 4,
    }),
    fetchSleeperProjections({
      season: options.season,
      week: currentWeek,
    }).catch(
      (): SleeperProjectionMap => ({
        byEspnId: new Map(),
        byNameTeam: new Map(),
        season: options.season,
        week: currentWeek,
        fetchedAt: new Date().toISOString(),
        emptyFeed: true,
      }),
    ),
  ]);

  const sleeperByEspnId: Record<string, number> = {};
  let maxPts = 1;
  for (const p of options.players) {
    const proj = sleeperProjForPlayer(sleeper, p);
    if (proj != null && Number.isFinite(proj)) {
      sleeperByEspnId[String(p.espnId)] = proj;
      maxPts = Math.max(maxPts, proj);
    }
    for (const w of p.recentWeeks ?? []) {
      if (typeof w.points === "number" && Number.isFinite(w.points)) {
        maxPts = Math.max(maxPts, w.points);
      }
    }
  }

  return {
    season: options.season,
    currentWeek,
    statsThroughWeek: Math.max(statsThroughWeek, 0),
    weekAxis: Array.from({ length: currentWeek }, (_, i) => i + 1),
    dvpByKey: dvpMapToRecord(dvpMap),
    sleeperByEspnId,
    sleeperEmpty: sleeper.emptyFeed,
    maxPts: Math.round(maxPts * 10) / 10,
  };
}

export function buildToolPlayerCard(
  player: FantasyPlayer,
  meta: ToolDisplayMeta | null | undefined,
  teammateImpacts: TeammateInjuryImpact[] = [],
): ToolPlayerCard {
  const dvpMap = dvpMapFromRecord(meta?.dvpByKey);
  const currentWeek = meta?.currentWeek ?? 1;
  const statsThroughWeek = meta?.statsThroughWeek ?? 0;
  const sleeperProj =
    meta?.sleeperByEspnId?.[String(player.espnId)] ??
    (Number.isFinite(player.projectedPoints) ? player.projectedPoints : null);
  // Prefer labeled Sleeper when present; fall back to pool proj only for strip.
  const hasSleeper =
    meta?.sleeperByEspnId?.[String(player.espnId)] != null &&
    !meta?.sleeperEmpty;

  const matchup = dvpForPlayer(dvpMap, player.opponent, player.position);
  const byeThisWeek = (player.opponent ?? "").toUpperCase() === "BYE";
  const weeks = weekCellsFromPlayer({
    player,
    currentWeek,
    statsThroughWeek,
    sleeperProj: hasSleeper
      ? sleeperProj
      : meta?.sleeperEmpty
        ? null
        : sleeperProj,
  });

  // Suppress unused warning — teammate chips rendered by callers
  void teammateImpacts;

  return {
    player,
    label: formatPlayerLabel(player.name, player.nflTeam),
    weeks,
    matchup,
    sleeperProj: hasSleeper ? sleeperProj : sleeperProj,
    sleeperLine: sleeperProjLine(hasSleeper ? sleeperProj : sleeperProj),
    formLine: formImpactLine(player),
    injuryTag: injuryTagFor(player.injuryStatus),
    injuryNote: injuryNoteFor(player),
    byeThisWeek,
  };
}

/** Preferred projection for verdict math: Sleeper when known, else pool proj. */
export function preferredProj(
  player: FantasyPlayer,
  meta?: ToolDisplayMeta | null,
): number {
  const fromSleeper = meta?.sleeperByEspnId?.[String(player.espnId)];
  if (fromSleeper != null && Number.isFinite(fromSleeper)) return fromSleeper;
  return player.projectedPoints;
}

export function positionPlural(position: PlayerPosition): string {
  if (position === "RB") return "RBs";
  if (position === "WR") return "WRs";
  if (position === "TE") return "TEs";
  if (position === "QB") return "QBs";
  return position;
}
