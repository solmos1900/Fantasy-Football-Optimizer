/**
 * Trade recommender for redraft leagues, in the league's own scoring.
 * Superflex leagues (see trade-value.ts) value QBs at full price and allow
 * QB-for-skill deals; the 1QB rules below apply otherwise.
 *
 * Aligned to PPR Fantasy Intelligence research brief (2026-09-22):
 * - Improve starters, not spreadsheet win%; surplus → need.
 * - Reject naked QB↔skill 1:1 (esp QB↔WR1); QB = package sweetener only.
 * - 2-for-1 ≈ star + 0–10% premium only if both pieces start.
 * - Scarcity: elite TE ≈ locked RB1 > volume WR1 > QB (1QB).
 * - Chip value = season PPG from played weeks (bye/missing proj ignored); half-PPR only when lean flips.
 * - Mutually beneficial For you / For them / Why accepted; optional sendables.
 *
 * Shared chip / need / hard-reject math lives in trade-value.ts (also used by
 * the interactive Trade Analyzer).
 */

import type {
  FantasyPlayer,
  FantasyTeam,
  InsightRecommendation,
  LeagueData,
} from "@/lib/types";
import { pointsOrZero } from "@/lib/utils";
import {
  analyzeDefenseMatchup,
  matchupContextFromLeague,
  recentFormSummary,
} from "@/lib/insights/defense-matchups";
import {
  SKILL_POSITIONS,
  starterNeed,
  TIER_RANK,
  type TrendLookup,
  acceptanceReason,
  byProjectedDesc,
  chipValue,
  depthAtPosition,
  fairnessScore,
  hasSurplus,
  isForbiddenOneForOne,
  isOutrageousValue,
  needFitScore,
  needsPosition,
  playersAtPosition,
  samePosBonus,
  sideValue,
  surplusAt,
  tierOf,
  trendBlurb,
  trendFitBonus,
} from "@/lib/insights/trade-value";
import { leagueScoring, type LeagueScoring } from "@/lib/league/scoring";

function rosterPool(league: LeagueData): FantasyPlayer[] {
  return league.teams.flatMap((t) => t.roster);
}

type Candidate = {
  them: FantasyTeam;
  give: FantasyPlayer[];
  receive: FantasyPlayer[];
  score: number;
  kind: "1for1" | "2for1" | "1for2" | "qb_package";
};

function consider(
  list: Candidate[],
  you: FantasyTeam,
  them: FantasyTeam,
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  kind: Candidate["kind"],
  trends: TrendLookup | undefined,
  scoring: LeagueScoring,
) {
  if (!give.length || !receive.length) return;
  if (isForbiddenOneForOne(give, receive, scoring)) return;
  if (isOutrageousValue(give, receive, trends, undefined, scoring)) return;

  const fit = needFitScore(you, them, give, receive, scoring);
  const fair = fairnessScore(give, receive, trends, undefined, scoring);
  const same = samePosBonus(give, receive);
  const trendBonus = trendFitBonus(give, receive, trends);
  const packageCushion =
    kind === "1for1" ? 0 : kind === "qb_package" ? 0.08 : 0.12;
  if (fit + same + Math.max(0, trendBonus) < 1.2) return;
  if (fair + packageCushion < 0.12) return;

  list.push({
    them,
    give,
    receive,
    score: fit * 1.4 + fair * 2 + same + trendBonus + packageCushion,
    kind,
  });
}

export function buildRealisticTrades(
  league: LeagueData,
  you: FantasyTeam,
  trends?: TrendLookup,
): InsightRecommendation[] {
  const scoring = leagueScoring(league);
  const others = league.teams.filter((t) => t.id !== you.id);
  const candidates: Candidate[] = [];
  const allPlayers = rosterPool(league);
  const matchupCtx = matchupContextFromLeague(league);

  // 1) Same-position 1:1
  for (const pos of SKILL_POSITIONS) {
    if (!hasSurplus(you, pos, scoring)) continue;
    for (const them of others) {
      const give = surplusAt(you, pos, scoring)[0];
      if (!give) continue;
      const theirPool = hasSurplus(them, pos, scoring)
        ? surplusAt(them, pos, scoring)
        : playersAtPosition(them, pos).slice(1);
      for (const receive of theirPool) {
        if (Math.abs(TIER_RANK[tierOf(receive)] - TIER_RANK[tierOf(give)]) > 1) {
          continue;
        }
        if (
          !needsPosition(them, pos, scoring) &&
          !needsPosition(you, pos, scoring) &&
          tierOf(receive) <= tierOf(give)
        ) {
          continue;
        }
        consider(candidates, you, them, [give], [receive], "1for1", trends, scoring);
      }
    }
  }

  // 2) Skill surplus → different skill need (never QB)
  for (const givePos of SKILL_POSITIONS) {
    if (!hasSurplus(you, givePos, scoring)) continue;
    for (const getPos of SKILL_POSITIONS) {
      if (givePos === getPos) continue;
      if (!needsPosition(you, getPos, scoring)) continue;
      for (const them of others) {
        if (!needsPosition(them, givePos, scoring)) continue;
        const give = surplusAt(you, givePos, scoring)[0];
        const receive =
          surplusAt(them, getPos, scoring)[0] ?? playersAtPosition(them, getPos)[1];
        if (!give || !receive) continue;
        consider(candidates, you, them, [give], [receive], "1for1", trends, scoring);
      }
    }
  }

  // 3) 2-for-1: two startable skill pieces → one better skill (≤10% premium)
  for (const them of others) {
    for (const starPos of SKILL_POSITIONS) {
      if (!needsPosition(you, starPos, scoring)) continue;
      const star = playersAtPosition(them, starPos)[0];
      if (!star || TIER_RANK[tierOf(star)] < TIER_RANK.high) continue;
      if (depthAtPosition(them, starPos) <= starterNeed(starPos, scoring)) {
        continue;
      }

      const pieces: FantasyPlayer[] = [];
      for (const pos of SKILL_POSITIONS) {
        if (!hasSurplus(you, pos, scoring)) continue;
        if (!(needsPosition(them, pos, scoring) || depthAtPosition(them, pos) <= 2)) {
          continue;
        }
        const extra = surplusAt(you, pos, scoring)[0];
        const floor = pos === "TE" ? 7 : 8;
        if (
          extra &&
          extra.id !== star.id &&
          pointsOrZero(extra.projectedPoints) >= floor
        ) {
          pieces.push(extra);
        }
        if (pieces.length >= 2) break;
      }
      if (pieces.length < 2) continue;
      const pkg = pieces.slice(0, 2);
      const starChip = chipValue(star, { trends, scoring });
      const pkgChip = sideValue(pkg, trends, undefined, scoring);
      if (pkgChip < starChip * 0.9) continue;
      if (pkgChip > starChip * 1.1) continue;
      consider(candidates, you, them, pkg, [star], "2for1", trends, scoring);
    }
  }

  // 4) 1-for-2: your stud → their two need fills
  for (const givePos of SKILL_POSITIONS) {
    const stud =
      surplusAt(you, givePos, scoring)[0] ?? playersAtPosition(you, givePos)[1];
    if (!stud || TIER_RANK[tierOf(stud)] < TIER_RANK.high) continue;

    for (const them of others) {
      if (!needsPosition(them, givePos, scoring)) continue;
      const recv: FantasyPlayer[] = [];
      for (const pos of SKILL_POSITIONS) {
        if (pos === givePos) continue;
        if (!needsPosition(you, pos, scoring)) continue;
        if (!hasSurplus(them, pos, scoring)) continue;
        const p = surplusAt(them, pos, scoring)[0];
        if (p) recv.push(p);
        if (recv.length >= 2) break;
      }
      if (recv.length < 2) continue;
      consider(candidates, you, them, [stud], recv.slice(0, 2), "1for2", trends, scoring);
    }
  }

  // 5) QB package only (never naked): QB + skill ↔ elite skill, partner needs QB
  if (hasSurplus(you, "QB", scoring)) {
    const qb = surplusAt(you, "QB", scoring)[0];
    if (qb) {
      for (const them of others) {
        if (!needsPosition(them, "QB", scoring)) continue;
        for (const skillPos of SKILL_POSITIONS) {
          if (!hasSurplus(you, skillPos, scoring)) continue;
          const skillGive = surplusAt(you, skillPos, scoring)[0];
          if (!skillGive) continue;
          for (const getPos of SKILL_POSITIONS) {
            if (!needsPosition(you, getPos, scoring)) continue;
            const elite = playersAtPosition(them, getPos)[0];
            if (!elite || TIER_RANK[tierOf(elite)] < TIER_RANK.high) continue;
            if (depthAtPosition(them, getPos) <= starterNeed(getPos, scoring)) {
              continue;
            }
            consider(
              candidates,
              you,
              them,
              [qb, skillGive],
              [elite],
              "qb_package",
              trends,
              scoring,
            );
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: InsightRecommendation[] = [];

  for (const c of candidates) {
    const key = `${c.them.id}:${c.give
      .map((p) => p.id)
      .sort()
      .join("+")}→${c.receive
      .map((p) => p.id)
      .sort()
      .join("+")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const whyYouRaw = [
      `You send: ${c.give.map((p) => `${p.name} (${p.position}, ${pointsOrZero(p.projectedPoints).toFixed(1)} proj)`).join(" + ")}.`,
      `You get: ${c.receive.map((p) => `${p.name} (${p.position}, ${pointsOrZero(p.projectedPoints).toFixed(1)} proj)`).join(" + ")}.`,
      ...c.receive
        .filter((p) => needsPosition(you, p.position, scoring))
        .map(
          (p) =>
            `Helps fill your ${p.position} gap (you currently have ${depthAtPosition(you, p.position)} healthy options there).`,
        ),
    ];
    for (const p of c.receive) {
      const form = recentFormSummary(p);
      if (form) whyYouRaw.push(form);
      const def = analyzeDefenseMatchup(p, allPlayers, matchupCtx);
      if (def && def.samples.length > 0) whyYouRaw.push(`This week: ${def.summary}`);
      const tb = trendBlurb(p, trends);
      if (tb) whyYouRaw.push(tb);
    }
    if (c.kind === "2for1" || c.kind === "qb_package") {
      whyYouRaw.push(
        "Note: you turn two roster spots into one starter — someone on your bench may become a drop.",
      );
    }
    const whyYou = whyYouRaw.slice(0, 6);

    const whyThemRaw = [
      `They send: ${c.receive.map((p) => `${p.name} (${p.position})`).join(" + ")}.`,
      `They get: ${c.give.map((p) => `${p.name} (${p.position}, ${pointsOrZero(p.projectedPoints).toFixed(1)} proj)`).join(" + ")}.`,
      ...c.give
        .filter((p) => needsPosition(c.them, p.position, scoring))
        .map(
          (p) =>
            `${c.them.name} could use ${p.position} help (they have ${depthAtPosition(c.them, p.position)} healthy options).`,
        ),
    ];
    for (const p of c.give) {
      const tb = trendBlurb(p, trends);
      if (tb) whyThemRaw.push(tb);
    }
    const whyThem = whyThemRaw.slice(0, 6);

    const trendNotes = [...c.give, ...c.receive]
      .map((p) => trendBlurb(p, trends))
      .filter((x): x is string => Boolean(x));

    const accept = acceptanceReason(
      you,
      c.them,
      c.give,
      c.receive,
      trends,
      undefined,
      undefined,
      scoring,
    );

    const giveIds = new Set(c.give.map((p) => p.id));
    const alternativeSendables = SKILL_POSITIONS.flatMap((pos) =>
      surplusAt(you, pos, scoring).filter((p) => !giveIds.has(p.id)),
    )
      .sort(byProjectedDesc)
      .slice(0, 3)
      .map((p) => ({ id: p.id, name: p.name, position: p.position }));

    out.push({
      id: `trade-${c.kind}-${key}`,
      type: "trade",
      priority: c.score >= 4 ? "high" : c.score >= 2.5 ? "medium" : "low",
      title:
        c.give.length === 1 && c.receive.length === 1
          ? `Trade ${c.give[0].name} ↔ ${c.receive[0].name} with ${c.them.name}`
          : `Trade ${c.give.map((p) => p.name).join(" + ")} ↔ ${c.receive.map((p) => p.name).join(" + ")} with ${c.them.name}`,
      summary: accept,
      reasoning: [
        "This trade fills a starter need on your side using a depth piece they want.",
        ...whyYou.slice(0, 2),
        ...whyThem.slice(0, 2),
        accept,
      ].slice(0, 5),
      relatedPlayerIds: [...c.give, ...c.receive].map((p) => p.id),
      relatedPositions: [
        ...new Set([...c.give, ...c.receive].map((p) => p.position)),
      ],
      trade: {
        partnerTeamId: c.them.id,
        partnerTeamName: c.them.name,
        give: c.give.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
        })),
        receive: c.receive.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
        })),
        whyYou,
        whyThem,
        trendNotes: trendNotes.length ? trendNotes : undefined,
        alternativeSendables: alternativeSendables.length
          ? alternativeSendables
          : undefined,
      },
    });

    if (out.length >= 5) break;
  }

  return out;
}
