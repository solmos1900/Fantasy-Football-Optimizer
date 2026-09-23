/**
 * Interactive Trade Analyzer grading for arbitrary give/get packages.
 * Reuses shared 1QB full-PPR chip / need helpers — no fake win %.
 */

import type { FantasyPlayer, FantasyTeam } from "@/lib/types";
import {
  type TrendLookup,
  acceptanceReason,
  chipValue,
  depthAtPosition,
  fairnessScore,
  hardRejectReasons,
  needFitScore,
  needsPosition,
  samePosBonus,
  sideValue,
  tierOf,
  trendBlurb,
  trendFitBonus,
} from "@/lib/insights/trade-value";

export type TradeVerdict =
  | "accept"
  | "lean_accept"
  | "fair"
  | "lean_reject"
  | "hard_reject";

export type AcceptanceLean = "none" | "low" | "medium" | "high";

export interface TradeAnalysis {
  verdict: TradeVerdict;
  /** Plain-language verdict for the UI. */
  verdictLabel: string;
  summary: string;
  giveValue: number;
  receiveValue: number;
  /** receive − give from your perspective (positive = you gain chip value). */
  valueGap: number;
  hardRejectReasons: string[];
  forYou: string[];
  forThem: string[];
  whyAcceptedOrNot: string;
  acceptanceLean: AcceptanceLean;
  acceptanceLeanLabel: string;
  /** Measurable inputs (projections, depth, chip totals). */
  facts: string[];
  /** Product judgment (verdict rationale, acceptance lean). */
  judgments: string[];
}

const VERDICT_LABEL: Record<TradeVerdict, string> = {
  accept: "Accept",
  lean_accept: "Lean accept",
  fair: "Fair",
  lean_reject: "Lean reject",
  hard_reject: "Hard reject",
};

const LEAN_LABEL: Record<AcceptanceLean, string> = {
  none: "None — blocked by hard reject",
  low: "Low",
  medium: "Medium",
  high: "High",
};

function names(players: FantasyPlayer[]): string {
  return players.map((p) => p.name).join(" + ");
}

function buildForYou(
  you: FantasyTeam,
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): string[] {
  const lines = [
    `You send: ${give.map((p) => `${p.name} (${p.position}, ${p.projectedPoints.toFixed(1)} proj, ${tierOf(p)})`).join(" + ")}.`,
    `You get: ${receive.map((p) => `${p.name} (${p.position}, ${p.projectedPoints.toFixed(1)} proj, ${tierOf(p)})`).join(" + ")}.`,
  ];
  for (const p of receive) {
    if (needsPosition(you, p.position)) {
      lines.push(
        `Fills your ${p.position} need (healthy depth was ${depthAtPosition(you, p.position)}).`,
      );
    }
    const tb = trendBlurb(p, trends);
    if (tb) lines.push(`Trend: ${tb}`);
  }
  for (const p of give) {
    if (needsPosition(you, p.position) && depthAtPosition(you, p.position) <= 2) {
      lines.push(
        `Caution: ${p.name} leaves a thinner ${p.position} group after the deal.`,
      );
    }
  }
  return lines.slice(0, 6);
}

function buildForThem(
  them: FantasyTeam,
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): string[] {
  const lines = [
    `They send: ${receive.map((p) => `${p.name} (${p.position})`).join(" + ")}.`,
    `They get: ${give.map((p) => `${p.name} (${p.position}, ${p.projectedPoints.toFixed(1)} proj)`).join(" + ")}.`,
  ];
  for (const p of give) {
    if (needsPosition(them, p.position)) {
      lines.push(
        `${them.name} needs ${p.position} help (depth ${depthAtPosition(them, p.position)}).`,
      );
    }
    const tb = trendBlurb(p, trends);
    if (tb) lines.push(`Trend on asset you send: ${tb}`);
  }
  return lines.slice(0, 6);
}

function theirAcceptanceLean(
  you: FantasyTeam,
  them: FantasyTeam,
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  fair: number,
  hardRejected: boolean,
): AcceptanceLean {
  if (hardRejected) return "none";

  const fillsTheirNeed = give.some((p) => needsPosition(them, p.position));
  const hurtsTheirStarter =
    receive.some(
      (p) => needsPosition(them, p.position) && !needsPosition(you, p.position),
    ) && !fillsTheirNeed;
  const valueFavorThem = sideValue(give) >= sideValue(receive) * 0.95;

  if (fillsTheirNeed && fair >= 0.45 && valueFavorThem) return "high";
  if (fillsTheirNeed && fair >= 0.3) return "medium";
  if (fair >= 0.5 && !hurtsTheirStarter) return "medium";
  if (fair >= 0.35) return "low";
  return "low";
}

function pickVerdict(args: {
  hardRejected: boolean;
  fair: number;
  fit: number;
  same: number;
  trendBonus: number;
  valueGap: number;
}): TradeVerdict {
  const { hardRejected, fair, fit, same, trendBonus, valueGap } = args;
  if (hardRejected) return "hard_reject";

  const combined = fit * 1.4 + fair * 2 + same + trendBonus;
  const youGain = valueGap >= -0.5;
  const close =
    Math.abs(valueGap) <= Math.max(2, Math.abs(valueGap) * 0.15 + 1.5);

  if (combined >= 4 && fair >= 0.45 && youGain) return "accept";
  if (combined >= 2.8 && fair >= 0.35) return "lean_accept";
  if (fair >= 0.4 && close) return "fair";
  if (fair >= 0.25 || fit >= 1) return "lean_reject";
  return "lean_reject";
}

/**
 * Grade a user-built trade. Empty sides return null (UI shows a prompt).
 */
export function analyzeTrade(
  you: FantasyTeam,
  them: FantasyTeam,
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): TradeAnalysis | null {
  if (!give.length || !receive.length) return null;

  const giveValue = sideValue(give, trends);
  const receiveValue = sideValue(receive, trends);
  const valueGap = receiveValue - giveValue;
  const rejects = hardRejectReasons(give, receive, trends);
  const hardRejected = rejects.length > 0;
  const fair = fairnessScore(give, receive, trends);
  const fit = needFitScore(you, them, give, receive);
  const same = samePosBonus(give, receive);
  const trendBonus = trendFitBonus(give, receive, trends);
  const verdict = pickVerdict({
    hardRejected,
    fair,
    fit,
    same,
    trendBonus,
    valueGap,
  });
  const lean = theirAcceptanceLean(
    you,
    them,
    give,
    receive,
    fair,
    hardRejected,
  );

  const forYou = buildForYou(you, give, receive, trends);
  const forThem = buildForThem(them, give, receive, trends);

  let whyAcceptedOrNot: string;
  if (hardRejected) {
    whyAcceptedOrNot = rejects[0];
  } else if (
    verdict === "accept" ||
    verdict === "lean_accept" ||
    verdict === "fair"
  ) {
    whyAcceptedOrNot = acceptanceReason(you, them, give, receive, trends);
  } else {
    const gaps: string[] = [];
    if (fair < 0.35) {
      gaps.push(
        `Chip values look uneven on the 1QB-PPR scale (${giveValue.toFixed(1)} vs ${receiveValue.toFixed(1)}).`,
      );
    }
    if (fit < 1.2) {
      gaps.push(
        `Need-fit is weak — neither roster clearly fills a starter hole, or you are dealing from a thin position.`,
      );
    }
    if (!gaps.length) {
      gaps.push(
        `Deal is close on paper but does not clearly improve both starting lineups.`,
      );
    }
    whyAcceptedOrNot = gaps.join(" ");
  }

  const facts = [
    `Scoring assumed: full PPR, standard 1QB redraft (QB chips discounted; ~70% ROS/form + ~30% this-week).`,
    `Your side chips: ${giveValue.toFixed(1)} (${names(give)}).`,
    `Their side chips: ${receiveValue.toFixed(1)} (${names(receive)}).`,
    `Value gap (you): ${valueGap >= 0 ? "+" : ""}${valueGap.toFixed(1)}.`,
    ...give.map(
      (p) =>
        `${p.name}: ${p.projectedPoints.toFixed(1)} proj · tier ${tierOf(p)} · chip ${chipValue(p, trends).toFixed(1)}.`,
    ),
    ...receive.map(
      (p) =>
        `${p.name}: ${p.projectedPoints.toFixed(1)} proj · tier ${tierOf(p)} · chip ${chipValue(p, trends).toFixed(1)}.`,
    ),
  ];

  const judgments = [
    `Verdict: ${VERDICT_LABEL[verdict]}.`,
    whyAcceptedOrNot,
    hardRejected
      ? `Partner acceptance lean: none (blocked by hard reject).`
      : `Partner acceptance lean: ${LEAN_LABEL[lean]} — heuristic need-fit band, not a calibrated probability.`,
  ];

  const summaryByVerdict: Record<TradeVerdict, string> = {
    accept: `Strong mutual fit — chip values and roster needs line up for both sides.`,
    lean_accept: `Looks workable — mild edge or need-fit lean in favor of doing the deal.`,
    fair: `Balanced chips with no clear smash; roster fit decides whether to pull the trigger.`,
    lean_reject: `Uneven or weak need-fit — proceed only if you have a specific playoff/schedule reason.`,
    hard_reject: `Blocked by 1QB PPR norms (naked QB↔skill or outrageous value/tier gap).`,
  };

  return {
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    summary: summaryByVerdict[verdict],
    giveValue,
    receiveValue,
    valueGap,
    hardRejectReasons: rejects,
    forYou,
    forThem,
    whyAcceptedOrNot,
    acceptanceLean: lean,
    acceptanceLeanLabel: LEAN_LABEL[lean],
    facts,
    judgments,
  };
}
