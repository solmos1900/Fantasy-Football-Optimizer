/**
 * PPR trade recommender for standard 1QB leagues.
 *
 * Norms encoded from public r/fantasyfootball trade threads / Trade Analyzer
 * discussions (value-over-replacement, positional scarcity, mutual need):
 * - In 1QB, startable QBs are plentiful; WRs/RBs fill multiple starter + flex
 *   slots, so naked QB↔skill 1:1 almost never clears (e.g. Baker ≠ Adams).
 * - Value QBs by points above waiver replacement, not raw projection.
 * - Accepted deals usually match surplus→need (same-pos or skill↔skill) and
 *   look fair to BOTH managers; 2-for-1 / 1-for-2 when values are uneven.
 *
 * HARD REJECTS
 * - Never 1-for-1 QB ↔ WR/RB/TE (or any non-QB).
 * - Never elite skill for mid/streamer when tiers differ by 2+.
 * - Never deals with value ratio > ~1.55 on our 1QB-discounted chip scale.
 *
 * PREFERRED
 * - Same-position depth swaps at similar tiers.
 * - Surplus skill → need skill (WR depth for RB need, etc.) — still not QB.
 * - 2-for-1 / 1-for-2 when one side is uneven.
 * - QB only as a package sweetener (QB + skill ↔ elite skill) when the partner
 *   clearly needs QB help.
 *
 * Every suggestion includes a short “why this gets accepted” grounded in holes + fair value.
 */

import type {
  FantasyPlayer,
  FantasyTeam,
  InsightRecommendation,
  LeagueData,
  PlayerPosition,
  PlayerTrendView,
} from "@/lib/types";
import {
  analyzeDefenseMatchup,
  recentFormSummary,
} from "@/lib/insights/defense-matchups";
import { trendLabelCopy } from "@/lib/insights/trend-labels";

const SKILL: PlayerPosition[] = ["RB", "WR", "TE"];

const STARTER_NEED: Partial<Record<PlayerPosition, number>> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
};

type Tier = "elite" | "high" | "mid" | "low" | "streamer";

const TIER_RANK: Record<Tier, number> = {
  elite: 5,
  high: 4,
  mid: 3,
  low: 2,
  streamer: 1,
};

function healthy(p: FantasyPlayer): boolean {
  return !["OUT", "IR", "DOUBTFUL"].includes(p.injuryStatus);
}

function byProj(a: FantasyPlayer, b: FantasyPlayer): number {
  return b.projectedPoints - a.projectedPoints;
}

function atPos(team: FantasyTeam, pos: PlayerPosition): FantasyPlayer[] {
  return team.roster.filter((p) => p.position === pos && healthy(p)).sort(byProj);
}

function depth(team: FantasyTeam, pos: PlayerPosition): number {
  return atPos(team, pos).length;
}

function rosterPool(league: LeagueData): FantasyPlayer[] {
  return league.teams.flatMap((t) => t.roster);
}

function tierOf(p: FantasyPlayer): Tier {
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

type TrendLookup = Map<number, PlayerTrendView> | undefined;

/** Trade-chip value; full-PPR blended, QB heavily discounted in 1QB. */
function chipValue(p: FantasyPlayer, trends?: TrendLookup): number {
  const recent =
    p.recentWeeks && p.recentWeeks.length
      ? p.recentWeeks.reduce((a, w) => a + w.points, 0) / p.recentWeeks.length
      : p.projectedPoints;
  let blended = p.projectedPoints * 0.65 + recent * 0.35;
  const trend = trends?.get(p.espnId);
  if (trend) blended += trend.restOfSeasonAdj;
  if (p.position === "QB") return blended * 0.45;
  if (p.position === "TE") return blended * 1.05;
  if (p.position === "RB") return blended * 1.1;
  return blended;
}

function sideValue(players: FantasyPlayer[], trends?: TrendLookup): number {
  return players.reduce((a, p) => a + chipValue(p, trends), 0);
}

function trendBlurb(p: FantasyPlayer, trends?: TrendLookup): string | null {
  const t = trends?.get(p.espnId);
  if (!t || t.trendLabel === "thin") return null;
  const delta =
    t.avgDelta != null
      ? ` avg ${t.avgDelta >= 0 ? "+" : ""}${t.avgDelta.toFixed(1)} vs stored proj`
      : "";
  return `${p.name}: ${trendLabelCopy(t.trendLabel).toLowerCase()}${delta} (${t.weeksSampled} wk sample).`;
}

function needsPos(team: FantasyTeam, pos: PlayerPosition): boolean {
  const need = STARTER_NEED[pos] ?? 1;
  const sorted = atPos(team, pos);
  if (sorted.length < need) return true;
  const floor = pos === "QB" ? 14 : pos === "TE" ? 7 : 9;
  const nth = sorted[need - 1];
  return !nth || nth.projectedPoints < floor;
}

function hasSurplus(team: FantasyTeam, pos: PlayerPosition): boolean {
  const need = STARTER_NEED[pos] ?? 1;
  const sorted = atPos(team, pos);
  if (sorted.length <= need) return false;
  const extra = sorted[need];
  return Boolean(extra && extra.projectedPoints >= (pos === "QB" ? 14 : 7));
}

function surplusOf(team: FantasyTeam, pos: PlayerPosition): FantasyPlayer[] {
  const need = STARTER_NEED[pos] ?? 1;
  return atPos(team, pos).slice(need);
}

function isSkill(pos: PlayerPosition): boolean {
  return SKILL.includes(pos);
}

/** Hard reject: naked QB-for-skill 1:1. */
function isForbiddenOneForOne(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
): boolean {
  if (give.length !== 1 || receive.length !== 1) return false;
  return (give[0].position === "QB") !== (receive[0].position === "QB");
}

function isOutrageousValue(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): boolean {
  const gv = sideValue(give, trends);
  const rv = sideValue(receive, trends);
  const ratio = Math.max(gv, rv) / Math.max(0.1, Math.min(gv, rv));
  if (ratio > 1.55) return true;

  if (give.length === 1 && receive.length === 1) {
    const gap = Math.abs(TIER_RANK[tierOf(give[0])] - TIER_RANK[tierOf(receive[0])]);
    if (gap >= 2) return true;
  }
  return false;
}

function fairnessScore(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): number {
  const gv = sideValue(give, trends);
  const rv = sideValue(receive, trends);
  const ratio = Math.max(gv, rv) / Math.max(0.1, Math.min(gv, rv));
  return Math.max(0, 1.4 - ratio);
}

function trendFitBonus(
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
  trends?: TrendLookup,
): number {
  if (!trends?.size) return 0;
  let bonus = 0;
  // Prefer buying players who are cold/bust (buy-low) when receiving
  for (const p of receive) {
    const t = trends.get(p.espnId);
    if (!t) continue;
    if (t.trendLabel === "bust" || t.trendLabel === "cold") bonus += 0.35;
    if (t.trendLabel === "rising" || t.trendLabel === "hot") bonus += 0.2;
  }
  // Prefer selling hot/boom when giving (sell-high)
  for (const p of give) {
    const t = trends.get(p.espnId);
    if (!t) continue;
    if (t.trendLabel === "boom" || t.trendLabel === "hot") bonus += 0.25;
    if (t.trendLabel === "falling" || t.trendLabel === "cold") bonus -= 0.15;
  }
  return bonus;
}

function needFitScore(
  you: FantasyTeam,
  them: FantasyTeam,
  give: FantasyPlayer[],
  receive: FantasyPlayer[],
): number {
  let score = 0;
  for (const p of receive) {
    if (needsPos(you, p.position)) score += 1.2;
    else if (isSkill(p.position)) score += 0.25;
  }
  for (const p of give) {
    if (needsPos(them, p.position)) score += 1.2;
    else if (isSkill(p.position)) score += 0.25;
    if (needsPos(you, p.position) && !hasSurplus(you, p.position)) score -= 1.5;
  }
  return score;
}

function samePosBonus(give: FantasyPlayer[], receive: FantasyPlayer[]): number {
  if (
    give.length === 1 &&
    receive.length === 1 &&
    give[0].position === receive[0].position
  ) {
    return 0.85;
  }
  return 0;
}

function acceptanceReason(
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
    give.every((p) => isSkill(p.position)) &&
    receive.every((p) => isSkill(p.position))
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

  const theirNeed = give.filter((p) => needsPos(them, p.position));
  const yourNeed = receive.filter((p) => needsPos(you, p.position));
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
    .filter((t) => t && (t.trendLabel === "bust" || t.trendLabel === "cold"));
  if (buyLow.length) {
    parts.push(
      `Includes a buy-low on ${buyLow.map((t) => t!.playerName).join(", ")} vs stored projections.`,
    );
  }

  return parts.join(" ");
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
  trends?: TrendLookup,
) {
  if (!give.length || !receive.length) return;
  if (isForbiddenOneForOne(give, receive)) return;
  if (isOutrageousValue(give, receive, trends)) return;

  const fit = needFitScore(you, them, give, receive);
  const fair = fairnessScore(give, receive, trends);
  const same = samePosBonus(give, receive);
  const trendBonus = trendFitBonus(give, receive, trends);
  if (fit + same + Math.max(0, trendBonus) < 1.2) return;
  if (fair < 0.35) return;

  list.push({
    them,
    give,
    receive,
    score: fit * 1.4 + fair * 2 + same + trendBonus,
    kind,
  });
}

export function buildRealisticTrades(
  league: LeagueData,
  you: FantasyTeam,
  trends?: TrendLookup,
): InsightRecommendation[] {
  const others = league.teams.filter((t) => t.id !== you.id);
  const candidates: Candidate[] = [];
  const allPlayers = rosterPool(league);

  // 1) Same-position 1:1
  for (const pos of SKILL) {
    if (!hasSurplus(you, pos)) continue;
    for (const them of others) {
      const give = surplusOf(you, pos)[0];
      if (!give) continue;
      const theirPool = hasSurplus(them, pos)
        ? surplusOf(them, pos)
        : atPos(them, pos).slice(1);
      for (const receive of theirPool) {
        if (Math.abs(TIER_RANK[tierOf(receive)] - TIER_RANK[tierOf(give)]) > 1) {
          continue;
        }
        // Prefer deals where at least one side has a real need, or it's a lateral upgrade
        if (
          !needsPos(them, pos) &&
          !needsPos(you, pos) &&
          tierOf(receive) <= tierOf(give)
        ) {
          continue;
        }
        consider(candidates, you, them, [give], [receive], "1for1", trends);
      }
    }
  }

  // 2) Skill surplus → different skill need (never QB)
  for (const givePos of SKILL) {
    if (!hasSurplus(you, givePos)) continue;
    for (const getPos of SKILL) {
      if (givePos === getPos) continue;
      if (!needsPos(you, getPos)) continue;
      for (const them of others) {
        if (!needsPos(them, givePos)) continue;
        const give = surplusOf(you, givePos)[0];
        const receive = surplusOf(them, getPos)[0] ?? atPos(them, getPos)[1];
        if (!give || !receive) continue;
        consider(candidates, you, them, [give], [receive], "1for1", trends);
      }
    }
  }

  // 3) 2-for-1: two surplus skill → one better skill
  for (const them of others) {
    for (const starPos of SKILL) {
      if (!needsPos(you, starPos)) continue;
      const star = atPos(them, starPos)[0];
      if (!star || TIER_RANK[tierOf(star)] < TIER_RANK.high) continue;
      if (depth(them, starPos) <= (STARTER_NEED[starPos] ?? 1)) continue;

      const pieces: FantasyPlayer[] = [];
      for (const pos of SKILL) {
        if (!hasSurplus(you, pos)) continue;
        if (!(needsPos(them, pos) || depth(them, pos) <= 2)) continue;
        const extra = surplusOf(you, pos)[0];
        if (extra && extra.id !== star.id) pieces.push(extra);
        if (pieces.length >= 2) break;
      }
      if (pieces.length < 2) continue;
      const pkg = pieces.slice(0, 2);
      if (sideValue(pkg, trends) < chipValue(star, trends) * 0.75) continue;
      if (sideValue(pkg, trends) > chipValue(star, trends) * 1.45) continue;
      consider(candidates, you, them, pkg, [star], "2for1", trends);
    }
  }

  // 4) 1-for-2: your stud → their two need fills
  for (const givePos of SKILL) {
    const stud = surplusOf(you, givePos)[0] ?? atPos(you, givePos)[1];
    if (!stud || TIER_RANK[tierOf(stud)] < TIER_RANK.high) continue;

    for (const them of others) {
      if (!needsPos(them, givePos)) continue;
      const recv: FantasyPlayer[] = [];
      for (const pos of SKILL) {
        if (pos === givePos) continue;
        if (!needsPos(you, pos)) continue;
        if (!hasSurplus(them, pos)) continue;
        const p = surplusOf(them, pos)[0];
        if (p) recv.push(p);
        if (recv.length >= 2) break;
      }
      if (recv.length < 2) continue;
      consider(candidates, you, them, [stud], recv.slice(0, 2), "1for2", trends);
    }
  }

  // 5) QB package only (never naked): QB + skill ↔ elite skill, partner needs QB
  if (hasSurplus(you, "QB")) {
    const qb = surplusOf(you, "QB")[0];
    if (qb) {
      for (const them of others) {
        if (!needsPos(them, "QB")) continue;
        for (const skillPos of SKILL) {
          if (!hasSurplus(you, skillPos)) continue;
          const skillGive = surplusOf(you, skillPos)[0];
          if (!skillGive) continue;
          for (const getPos of SKILL) {
            if (!needsPos(you, getPos)) continue;
            const elite = atPos(them, getPos)[0];
            if (!elite || TIER_RANK[tierOf(elite)] < TIER_RANK.high) continue;
            if (depth(them, getPos) <= (STARTER_NEED[getPos] ?? 1)) continue;
            consider(
              candidates,
              you,
              them,
              [qb, skillGive],
              [elite],
              "qb_package",
              trends,
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

    const whyYou = [
      `You send: ${c.give.map((p) => `${p.name} (${p.position}, ${p.projectedPoints.toFixed(1)} proj, ${tierOf(p)})`).join(" + ")}.`,
      `You get: ${c.receive.map((p) => `${p.name} (${p.position}, ${p.projectedPoints.toFixed(1)} proj, ${tierOf(p)})`).join(" + ")}.`,
      ...c.receive
        .filter((p) => needsPos(you, p.position))
        .map(
          (p) =>
            `Fills your ${p.position} need (healthy depth was ${depth(you, p.position)}).`,
        ),
    ];
    for (const p of c.receive) {
      const form = recentFormSummary(p);
      if (form) whyYou.push(form);
      const def = analyzeDefenseMatchup(p, allPlayers);
      if (def) whyYou.push(`This week: ${def.summary}`);
      const tb = trendBlurb(p, trends);
      if (tb) whyYou.push(`Trend: ${tb}`);
    }

    const whyThem = [
      `They send: ${c.receive.map((p) => `${p.name} (${p.position})`).join(" + ")}.`,
      `They get: ${c.give.map((p) => `${p.name} (${p.position}, ${p.projectedPoints.toFixed(1)} proj)`).join(" + ")}.`,
      ...c.give
        .filter((p) => needsPos(c.them, p.position))
        .map(
          (p) =>
            `${c.them.name} needs ${p.position} help (depth ${depth(c.them, p.position)}).`,
        ),
    ];
    for (const p of c.give) {
      const tb = trendBlurb(p, trends);
      if (tb) whyThem.push(`Trend on asset you send: ${tb}`);
    }

    const trendNotes = [...c.give, ...c.receive]
      .map((p) => trendBlurb(p, trends))
      .filter((x): x is string => Boolean(x));

    const accept = acceptanceReason(you, c.them, c.give, c.receive, trends);

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
        ...whyYou.map((r) => `For you: ${r}`),
        ...whyThem.map((r) => `For them: ${r}`),
        `Why this gets accepted: ${accept}`,
        `Scoring: full PPR chip blend (65% this-week proj + 35% recent actual) with 1QB QB discount; stored boom/bust nudges when snapshots exist.`,
        `Rule check: blocked naked QB↔skill 1:1; value within 1QB PPR norms.`,
      ],
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
      },
    });

    if (out.length >= 5) break;
  }

  return out;
}
