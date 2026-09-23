/**
 * Shared 1QB full-PPR trade chip math and roster-need helpers.
 * Used by Insights auto-suggestions and the interactive Trade Analyzer.
 *
 * Aligned to PPR Fantasy Intelligence (#7): ~70% ROS/form + ~30% this-week,
 * scarcity TE/RB1 > WR1 > QB, optional Neon trend nudges.
 */

import type {
  FantasyPlayer,
  FantasyTeam,
  PlayerPosition,
  PlayerTrendView,
} from "@/lib/types";
import {
  normalizeTrendLabel,
  trendLabelCopy,
} from "@/lib/insights/trend-labels";

export const SKILL_POSITIONS: PlayerPosition[] = ["RB", "WR", "TE"];
/** @deprecated Prefer SKILL_POSITIONS — kept as alias for call-site clarity. */
export const SKILL = SKILL_POSITIONS;

export const STARTER_NEED: Partial<Record<PlayerPosition, number>> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
};

export type TradeTier = "elite" | "high" | "mid" | "low" | "streamer";

export const TIER_RANK: Record<TradeTier, number> = {
  elite: 5,
  high: 4,
  mid: 3,
  low: 2,
  streamer: 1,
};

/** Chip-value ratio above this is treated as outrageous on our 1QB scale. */
export const OUTRAGEOUS_VALUE_RATIO = 1.55;

export type TrendLookup = Map<number, PlayerTrendView> | undefined;

export function isHealthy(p: FantasyPlayer): boolean {
  return !["OUT", "IR", "DOUBTFUL"].includes(p.injuryStatus);
}

export function byProjectedDesc(a: FantasyPlayer, b: FantasyPlayer): number {
  return b.projectedPoints - a.projectedPoints;
}

export function playersAtPosition(
  team: FantasyTeam,
  pos: PlayerPosition,
): FantasyPlayer[] {
  return team.roster
    .filter((p) => p.position === pos && isHealthy(p))
    .sort(byProjectedDesc);
}

export function depthAtPosition(
  team: FantasyTeam,
  pos: PlayerPosition,
): number {
  return playersAtPosition(team, pos).length;
}

export function tierOf(p: FantasyPlayer): TradeTier {
  const pts = p.projectedPoints;
  if (p.position === "QB") {
    if (pts >= 22) return "elite";
    if (pts >= 18) return "high";
    if (pts >= 15) return "mid";
    return "streamer";
  }
  if (p.position === "TE") {
    if (pts >= 14) return "elite";
    if (pts >= 10) return "high";
    if (pts >= 7) return "mid";
    return "low";
  }
  if (pts >= 16) return "elite";
  if (pts >= 12) return "high";
  if (pts >= 9) return "mid";
  if (pts >= 6) return "low";
  return "streamer";
}

/**
 * Trade-chip value; full-PPR. ROS/form ~70%, this-week proj ~30%.
 * Scarcity: elite TE ≈ locked RB1 > volume WR1 > QB (1QB).
 */
export function chipValue(p: FantasyPlayer, trends?: TrendLookup): number {
  const recent =
    p.recentWeeks && p.recentWeeks.length
      ? p.recentWeeks.reduce((a, w) => a + w.points, 0) / p.recentWeeks.length
      : p.projectedPoints;
  let blended = p.projectedPoints * 0.3 + recent * 0.7;
  const trend = trends?.get(p.espnId);
  // Injury/role outranks hot/cold — InjuryRisk adj is already large negative
  if (trend) blended += trend.restOfSeasonAdj;
  if (["OUT", "IR", "DOUBTFUL"].includes(p.injuryStatus)) blended *= 0.15;

  if (p.position === "QB") return blended * 0.45;
  if (p.position === "TE") {
    const elite = p.projectedPoints >= 12 || tierOf(p) === "elite";
    return blended * (elite ? 1.2 : 1.05);
  }
  if (p.position === "RB") {
    const locked =
      p.projectedPoints >= 14 ||
      tierOf(p) === "elite" ||
      tierOf(p) === "high";
    return blended * (locked ? 1.15 : 1.05);
  }
  if (tierOf(p) === "elite" || tierOf(p) === "high") return blended * 1.05;
  return blended;
}

export function sideValue(
  players: FantasyPlayer[],
  trends?: TrendLookup,
): number {
  return players.reduce((a, p) => a + chipValue(p, trends), 0);
}

export function trendBlurb(
  p: FantasyPlayer,
  trends?: TrendLookup,
): string | null {
  const t = trends?.get(p.espnId);
  if (!t) return null;
  const label = normalizeTrendLabel(t.trendLabel);
  if (label === "Thin") return null;
  const delta =
    t.avgDelta != null
      ? ` — about ${t.avgDelta >= 0 ? "+" : ""}${t.avgDelta.toFixed(1)} vs projection lately`
      : "";
  return `${p.name} is ${trendLabelCopy(label).toLowerCase()}${delta}.`;
}

export function needsPosition(
  team: FantasyTeam,
  pos: PlayerPosition,
): boolean {
  const need = STARTER_NEED[pos] ?? 1;
  const sorted = playersAtPosition(team, pos);
  if (sorted.length < need) return true;
  const floor = pos === "QB" ? 14 : pos === "TE" ? 7 : 9;
  const nth = sorted[need - 1];
  return !nth || nth.projectedPoints < floor;
}

export function hasSurplus(team: FantasyTeam, pos: PlayerPosition): boolean {
  const need = STARTER_NEED[pos] ?? 1;
  const sorted = playersAtPosition(team, pos);
  if (sorted.length <= need) return false;
  const extra = sorted[need];
  return Boolean(extra && extra.projectedPoints >= (pos === "QB" ? 14 : 7));
}

export function surplusAt(
  team: FantasyTeam,
  pos: PlayerPosition,
): FantasyPlayer[] {
  const need = STARTER_NEED[pos] ?? 1;
  return playersAtPosition(team, pos).slice(need);
}

export function isSkillPosition(pos: PlayerPosition): boolean {
  return SKILL_POSITIONS.includes(pos);
}

/** Hard reject: naked QB-for-skill 1:1. */
export function isForbiddenOneForOne(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
): boolean {
  if (give.length !== 1 || receive.length !== 1) return false;
  return (give[0].position === "QB") !== (receive[0].position === "QB");
}

export function isOutrageousValue(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): boolean {
  const gv = sideValue(give, trends);
  const rv = sideValue(receive, trends);
  const ratio = Math.max(gv, rv) / Math.max(0.1, Math.min(gv, rv));
  if (ratio > OUTRAGEOUS_VALUE_RATIO) return true;

  if (give.length === 1 && receive.length === 1) {
    const gap = Math.abs(
      TIER_RANK[tierOf(give[0])] - TIER_RANK[tierOf(receive[0])],
    );
    if (gap >= 2) return true;
  }
  return false;
}

/** Higher is fairer. Aligns with outrage cap (~1.55). */
export function fairnessScore(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): number {
  const gv = sideValue(give, trends);
  const rv = sideValue(receive, trends);
  const ratio = Math.max(gv, rv) / Math.max(0.1, Math.min(gv, rv));
  return Math.max(0, 1.55 - ratio);
}

export function trendFitBonus(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): number {
  if (!trends?.size) return 0;
  let bonus = 0;
  for (const p of receive) {
    const t = trends.get(p.espnId);
    if (!t) continue;
    const label = normalizeTrendLabel(t.trendLabel);
    if (label === "InjuryRisk") bonus -= 0.5;
    if (label === "Fading" || label === "BoomBust") bonus += 0.3;
    if (label === "Rising") bonus += 0.15;
  }
  for (const p of give) {
    const t = trends.get(p.espnId);
    if (!t) continue;
    const label = normalizeTrendLabel(t.trendLabel);
    if (label === "Rising") bonus += 0.2;
    if (label === "Fading") bonus -= 0.15;
    if (label === "InjuryRisk") bonus += 0.1;
  }
  return bonus;
}

export function needFitScore(
  you: FantasyTeam,
  them: FantasyTeam,
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
): number {
  let score = 0;
  for (const p of receive) {
    if (needsPosition(you, p.position)) score += 1.2;
    else if (isSkillPosition(p.position)) score += 0.25;
  }
  for (const p of give) {
    if (needsPosition(them, p.position)) score += 1.2;
    else if (isSkillPosition(p.position)) score += 0.25;
    if (needsPosition(you, p.position) && !hasSurplus(you, p.position)) {
      score -= 1.5;
    }
  }
  return score;
}

export function samePosBonus(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
): number {
  if (
    give.length === 1 &&
    receive.length === 1 &&
    give[0].position === receive[0].position
  ) {
    return 0.85;
  }
  return 0;
}

export function acceptanceReason(
  you: FantasyTeam,
  them: FantasyTeam,
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): string {
  const parts: string[] = [];

  if (
    give.length === 1 &&
    receive.length === 1 &&
    give[0].position === receive[0].position
  ) {
    parts.push(
      `Same-position ${give[0].position} swap (${tierOf(give[0])} ↔ ${tierOf(receive[0])}) — the deal shape leagues actually accept.`,
    );
  } else if (
    give.every((p) => isSkillPosition(p.position)) &&
    receive.every((p) => isSkillPosition(p.position))
  ) {
    parts.push(
      `Skill-for-skill (no naked QB) matching surplus on one side to need on the other.`,
    );
  } else {
    parts.push(
      `QB only appears as a package sweetener beside skill value — never 1:1 for a WR/RB/TE.`,
    );
  }

  parts.push(
    `Chip values close on a full-PPR 1QB scale with QBs discounted (${sideValue(give, trends).toFixed(1)} vs ${sideValue(receive, trends).toFixed(1)}).`,
  );

  const theirNeed = give.filter((p) => needsPosition(them, p.position));
  const yourNeed = receive.filter((p) => needsPosition(you, p.position));
  if (theirNeed.length) {
    parts.push(
      `${them.name} has a ${[...new Set(theirNeed.map((p) => p.position))].join("/")} hole this fills.`,
    );
  }
  if (yourNeed.length) {
    parts.push(
      `You have a ${[...new Set(yourNeed.map((p) => p.position))].join("/")} hole this fills.`,
    );
  }

  const buyLow = receive
    .map((p) => trends?.get(p.espnId))
    .filter((t) => {
      if (!t) return false;
      const label = normalizeTrendLabel(t.trendLabel);
      return label === "Fading" || label === "BoomBust";
    });
  if (buyLow.length) {
    parts.push(
      `Includes a buy-low on ${buyLow.map((t) => t!.playerName).join(", ")} — they have been cooling off or boom-or-bust lately.`,
    );
  }

  return parts.join(" ");
}

export function hardRejectReasons(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): string[] {
  const reasons: string[] = [];

  if (isForbiddenOneForOne(give, receive)) {
    const qbSide = give[0].position === "QB" ? give[0] : receive[0];
    const skillSide = give[0].position === "QB" ? receive[0] : give[0];
    reasons.push(
      `Hard reject: naked QB↔skill 1:1 (${qbSide.name} for ${skillSide.name}). In 1QB leagues, streamer QBs are deep and elite skill is scarce — this almost never clears.`,
    );
  }

  if (isOutrageousValue(give, receive, trends)) {
    const gv = sideValue(give, trends);
    const rv = sideValue(receive, trends);
    const ratio = Math.max(gv, rv) / Math.max(0.1, Math.min(gv, rv));
    if (ratio > OUTRAGEOUS_VALUE_RATIO) {
      reasons.push(
        `Hard reject: chip-value ratio ${ratio.toFixed(2)} exceeds ~${OUTRAGEOUS_VALUE_RATIO} on our 1QB-discounted scale (${gv.toFixed(1)} vs ${rv.toFixed(1)}).`,
      );
    } else if (give.length === 1 && receive.length === 1) {
      reasons.push(
        `Hard reject: tier gap of 2+ (${tierOf(give[0])} ↔ ${tierOf(receive[0])}) on a 1:1.`,
      );
    }
  }

  return reasons;
}
