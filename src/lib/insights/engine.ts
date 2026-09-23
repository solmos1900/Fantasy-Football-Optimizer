import type {
  FantasyPlayer,
  FantasyTeam,
  InsightRecommendation,
  InsightsBundle,
  LeagueData,
  PlayerNewsItem,
  PlayerPosition,
} from "@/lib/types";
import {
  analyzeDefenseMatchup,
  averageRecentPoints,
  inferPlayerRole,
  recentFormSummary,
} from "@/lib/insights/defense-matchups";
import { buildRealisticTrades } from "@/lib/insights/trades";
import { buildWaiverShark } from "@/lib/insights/waivers";
import type { PlayerTrendView } from "@/lib/types";
import { trendLabelCopy } from "@/lib/insights/trend-labels";

const SKILL_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];

function startersOf(team: FantasyTeam): FantasyPlayer[] {
  return team.roster.filter((p) => p.isStarter);
}

function benchOf(team: FantasyTeam): FantasyPlayer[] {
  return team.roster.filter((p) => !p.isStarter && p.slot !== "IR");
}

function rosterPool(league: LeagueData): FantasyPlayer[] {
  return league.teams.flatMap((t) => t.roster);
}

function avgProjected(
  teams: FantasyTeam[],
  pos: PlayerPosition,
): number {
  const values: number[] = [];
  for (const team of teams) {
    const best = startersOf(team)
      .filter((p) => p.position === pos)
      .map((p) => p.projectedPoints);
    if (best.length) values.push(best.reduce((a, b) => a + b, 0) / best.length);
  }
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function depthAt(team: FantasyTeam, pos: PlayerPosition): number {
  return team.roster.filter(
    (p) =>
      p.position === pos &&
      p.injuryStatus !== "OUT" &&
      p.injuryStatus !== "IR",
  ).length;
}

function byPriority(
  a: InsightRecommendation,
  b: InsightRecommendation,
): number {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return rank[a.priority] - rank[b.priority];
}

function currentTeam(league: LeagueData): FantasyTeam | undefined {
  return (
    league.teams.find((t) => t.isCurrentUser) ??
    league.teams.find((t) => t.id === league.userTeamId) ??
    league.teams[0]
  );
}

function buildStartSit(
  league: LeagueData,
  team: FantasyTeam,
): InsightRecommendation[] {
  const out: InsightRecommendation[] = [];
  const starters = startersOf(team);
  const bench = benchOf(team);
  const pool = rosterPool(league);

  for (const b of bench) {
    if (b.injuryStatus === "OUT" || b.injuryStatus === "IR") continue;

    const comparable = starters.filter(
      (s) =>
        s.position === b.position ||
        (s.slot === "FLEX" && ["RB", "WR", "TE"].includes(b.position)),
    );
    const weakest = [...comparable].sort(
      (a, c) => a.projectedPoints - c.projectedPoints,
    )[0];
    if (!weakest) continue;

    const projDelta = b.projectedPoints - weakest.projectedPoints;
    const recentB = averageRecentPoints(b.recentWeeks);
    const recentW = averageRecentPoints(weakest.recentWeeks);
    const formDelta =
      recentB != null && recentW != null ? recentB - recentW : null;

    const defense = analyzeDefenseMatchup(b, pool);
    const sitDefense = analyzeDefenseMatchup(weakest, pool);
    const toughForBench = defense?.toughMatchup ?? false;
    const toughForStarter = sitDefense?.toughMatchup ?? false;

    const shouldStart =
      (projDelta >= 1.5 || (formDelta != null && formDelta >= 2)) &&
      !toughForBench;
    const sitDespiteProj = projDelta >= 1.5 && toughForBench;
    if (!shouldStart && !sitDespiteProj) continue;

    const reasoning: string[] = [
      `${b.name} (${b.position}, ${b.nflTeam}) is on your bench projecting ${b.projectedPoints.toFixed(1)} PPR.`,
      `${weakest.name} is slotted at ${weakest.slot} projecting ${weakest.projectedPoints.toFixed(1)} PPR.`,
      `Projection delta: ${projDelta >= 0 ? "+" : ""}${projDelta.toFixed(1)} (1.5-pt threshold).`,
    ];
    const formB = recentFormSummary(b);
    const formW = recentFormSummary(weakest);
    if (formB) reasoning.push(formB);
    if (formW) reasoning.push(`${weakest.name} — ${formW}`);
    if (formDelta != null) {
      reasoning.push(
        `Recent-form delta: ${formDelta >= 0 ? "+" : ""}${formDelta.toFixed(1)} PPR.`,
      );
    }
    if (defense) reasoning.push(`Matchup history for ${b.name}: ${defense.summary}`);
    if (sitDefense) {
      reasoning.push(`Matchup history for ${weakest.name}: ${sitDefense.summary}`);
    }
    if (weakest.injuryStatus !== "ACTIVE") {
      reasoning.push(`${weakest.name} injury flag: ${weakest.injuryStatus}.`);
    }
    if (b.injuryStatus !== "ACTIVE") {
      reasoning.push(`${b.name} injury flag: ${b.injuryStatus}.`);
    }
    reasoning.push(`Role comparison uses ${inferPlayerRole(b)} vs similar players.`);

    if (sitDespiteProj && defense) {
      out.push({
        id: `start-sit-caution-${b.id}-${weakest.id}`,
        type: "start_sit",
        priority: "medium",
        verdict: "SIT",
        title: `SIT ${b.name} despite higher projection — tough ${defense.opponent} matchup`,
        summary: `${b.name} projects ${b.projectedPoints.toFixed(1)} but similar ${inferPlayerRole(b)}s have struggled vs ${defense.opponent}.`,
        reasoning,
        relatedPlayerIds: [b.id, weakest.id],
      });
    } else if (shouldStart) {
      out.push({
        id: `start-sit-${b.id}-${weakest.id}`,
        type: "start_sit",
        priority:
          projDelta >= 3 || (formDelta != null && formDelta >= 4)
            ? "high"
            : "medium",
        verdict: "START",
        title: `START ${b.name} over ${weakest.name}`,
        summary: `${b.name} projects ${b.projectedPoints.toFixed(1)} vs ${weakest.name}'s ${weakest.projectedPoints.toFixed(1)}${toughForStarter ? ` — and ${weakest.name}'s matchup looks worse historically` : ""}.`,
        reasoning,
        relatedPlayerIds: [b.id, weakest.id],
      });
    }
  }

  for (const s of starters) {
    if (!["OUT", "DOUBTFUL", "IR"].includes(s.injuryStatus)) continue;
    const replacement = bench
      .filter(
        (b) =>
          (b.position === s.position ||
            (s.slot === "FLEX" && ["RB", "WR", "TE"].includes(b.position))) &&
          !["OUT", "IR"].includes(b.injuryStatus),
      )
      .sort((a, b) => b.projectedPoints - a.projectedPoints)[0];

    const reasoning = [
      `${s.name} carries injury status ${s.injuryStatus} but is still in a starting slot (${s.slot}).`,
      replacement
        ? `Best bench option: ${replacement.name} (${replacement.projectedPoints.toFixed(1)} proj, ${replacement.injuryStatus}).`
        : `No healthy same-position bench replacement — check free agents.`,
      `Starting injured players risks a zero and weakens weekly ceiling.`,
    ];
    const form = recentFormSummary(replacement ?? s);
    if (form) reasoning.push(form);
    if (replacement) {
      const def = analyzeDefenseMatchup(replacement, pool);
      if (def) reasoning.push(def.summary);
    }

    out.push({
      id: `injury-sit-${s.id}`,
      type: "start_sit",
      priority: "high",
      verdict: "SIT",
      title: `SIT ${s.name} (${s.injuryStatus})${replacement ? ` — START ${replacement.name}` : ""}`,
      summary: replacement
        ? `Move ${replacement.name} into the lineup over injured ${s.name}.`
        : `Sit ${s.name}; no clear bench replacement.`,
      reasoning,
      relatedPlayerIds: replacement ? [s.id, replacement.id] : [s.id],
    });
  }

  return out;
}

function buildMatchupNotes(
  league: LeagueData,
  team: FantasyTeam,
): InsightRecommendation[] {
  const out: InsightRecommendation[] = [];
  const pool = rosterPool(league);

  for (const s of startersOf(team)) {
    if (!SKILL_POSITIONS.includes(s.position)) continue;
    if (["OUT", "DOUBTFUL", "IR"].includes(s.injuryStatus)) continue;

    const def = analyzeDefenseMatchup(s, pool);
    if (!def?.toughMatchup) continue;

    const formAvg = averageRecentPoints(s.recentWeeks);
    out.push({
      id: `matchup-note-${s.id}`,
      type: "matchup_note",
      priority: "medium",
      verdict: "SIT",
      title: `Matchup caution: ${s.name} vs ${def.opponent}`,
      summary: def.summary,
      reasoning: [
        `${s.name} projects ${s.projectedPoints.toFixed(1)} this week vs ${def.opponent}.`,
        def.summary,
        formAvg != null
          ? `Recent form avg ${formAvg.toFixed(1)} PPR across last scored weeks.`
          : `No prior-week scoring history stored yet — relying on projection + defense samples.`,
        `Role used for comparison: ${inferPlayerRole(s)}.`,
      ],
      relatedPlayerIds: [s.id],
    });
  }

  return out;
}

function buildOther(
  league: LeagueData,
  team: FantasyTeam,
): InsightRecommendation[] {
  const out: InsightRecommendation[] = [];
  const starters = startersOf(team);
  const bench = benchOf(team);
  const owned = new Set(rosterPool(league).map((p) => p.espnId));

  for (const pos of SKILL_POSITIONS) {
    const myStarters = starters.filter((p) => p.position === pos);
    if (!myStarters.length) continue;
    const myAvg =
      myStarters.reduce((a, p) => a + p.projectedPoints, 0) / myStarters.length;
    const leagueAvg = avgProjected(league.teams, pos);
    if (leagueAvg > 0 && myAvg < leagueAvg - 2) {
      out.push({
        id: `weak-${pos}`,
        type: "weak_position",
        priority: myAvg < leagueAvg - 4 ? "high" : "medium",
        title: `${pos} looks below league average`,
        summary: `Your ${pos} starters project ${myAvg.toFixed(1)} vs league ${leagueAvg.toFixed(1)}.`,
        reasoning: [
          `League-average starting ${pos} projection: ${leagueAvg.toFixed(1)}.`,
          `Your starting ${pos} average: ${myAvg.toFixed(1)} (${(myAvg - leagueAvg).toFixed(1)} gap).`,
          `Heuristic: gaps worse than −2 projected points flag a positional weakness.`,
          `Consider waiver adds or the trade suggestions targeting ${pos}.`,
        ],
        relatedPositions: [pos],
        relatedPlayerIds: myStarters.map((p) => p.id),
      });
    }
  }

  const drops = bench
    .filter(
      (p) =>
        p.percentOwned < 35 ||
        p.injuryStatus === "OUT" ||
        p.projectedPoints < 4,
    )
    .sort((a, b) => a.projectedPoints - b.projectedPoints);

  const adds = league.freeAgents
    .filter((fa) => !owned.has(fa.espnId))
    .filter((fa) => fa.projectedPoints >= 8 || fa.percentOwned >= 30)
    .sort((a, b) => b.projectedPoints - a.projectedPoints);

  for (let i = 0; i < Math.min(2, drops.length, adds.length); i++) {
    const drop = drops[i];
    const add = adds[i];
    if (!drop || !add) continue;
    if (add.projectedPoints < drop.projectedPoints + 1) continue;

    out.push({
      id: `drop-add-${drop.id}-${add.id}`,
      type: "drop_add",
      priority: add.projectedPoints - drop.projectedPoints >= 4 ? "high" : "medium",
      title: `Drop ${drop.name} → add ${add.name}`,
      summary: `${add.name} projects ${add.projectedPoints.toFixed(1)} vs ${drop.name}'s ${drop.projectedPoints.toFixed(1)}.`,
      reasoning: [
        `${drop.name} is benched with ${drop.projectedPoints.toFixed(1)} projected and ${drop.percentOwned.toFixed(0)}% ownership.`,
        drop.injuryStatus !== "ACTIVE"
          ? `Drop candidate injury status: ${drop.injuryStatus}.`
          : `Low utilization / projection makes the roster spot costly.`,
        `${add.name} is available (${add.percentOwned.toFixed(0)}% owned) projecting ${add.projectedPoints.toFixed(1)}.`,
        `Projection uplift: +${(add.projectedPoints - drop.projectedPoints).toFixed(1)} if the add earns a role.`,
      ],
      relatedPlayerIds: [drop.id, add.id],
    });
  }

  const matchup = league.matchups.find(
    (m) => m.homeTeamId === team.id || m.awayTeamId === team.id,
  );
  if (matchup) {
    const iAmHome = matchup.homeTeamId === team.id;
    const myProj = iAmHome ? matchup.homeProjected : matchup.awayProjected;
    const oppProj = iAmHome ? matchup.awayProjected : matchup.homeProjected;
    const oppId = iAmHome ? matchup.awayTeamId : matchup.homeTeamId;
    const opp = league.teams.find((t) => t.id === oppId);
    const delta = myProj - oppProj;

    if (Math.abs(delta) >= 8) {
      out.push({
        id: `mismatch-week-${matchup.week}`,
        type: "mismatch",
        priority: Math.abs(delta) >= 15 ? "high" : "medium",
        title:
          delta >= 0
            ? `Favorable matchup vs ${opp?.name ?? "opponent"}`
            : `Tough matchup vs ${opp?.name ?? "opponent"}`,
        summary: `Projected ${myProj.toFixed(1)} to ${oppProj.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}).`,
        reasoning: [
          `Your team projects ${myProj.toFixed(1)} points this week.`,
          `${opp?.name ?? "Opponent"} projects ${oppProj.toFixed(1)} points.`,
          delta >= 0
            ? `You are favored by ${delta.toFixed(1)} — lock in high-floor plays.`
            : `You are underdogs by ${Math.abs(delta).toFixed(1)} — prioritize ceiling plays.`,
          `Based on ESPN projected team totals for week ${matchup.week}.`,
        ],
      });
    }
  }

  for (const pos of ["K", "D/ST"] as PlayerPosition[]) {
    const mine = starters.find((p) => p.position === pos);
    if (!mine) continue;
    const betterFa = league.freeAgents
      .filter(
        (fa) =>
          fa.position === pos && fa.projectedPoints > mine.projectedPoints + 1.5,
      )
      .sort((a, b) => b.projectedPoints - a.projectedPoints)[0];
    if (betterFa) {
      out.push({
        id: `stream-${pos}-${betterFa.id}`,
        type: "streaming",
        priority: "low",
        title: `Stream ${pos}: ${betterFa.name} over ${mine.name}`,
        summary: `${betterFa.name} projects ${betterFa.projectedPoints.toFixed(1)} vs ${mine.projectedPoints.toFixed(1)}.`,
        reasoning: [
          `${pos} is highly matchup-dependent; streaming is a common efficiency tactic.`,
          `Current starter ${mine.name}: ${mine.projectedPoints.toFixed(1)} projected.`,
          `Available ${betterFa.name}: ${betterFa.projectedPoints.toFixed(1)} projected (${betterFa.percentOwned.toFixed(0)}% owned).`,
          `Uplift of ${(betterFa.projectedPoints - mine.projectedPoints).toFixed(1)} on a replaceable roster spot.`,
        ],
        relatedPlayerIds: [mine.id, betterFa.id],
        relatedPositions: [pos],
      });
    }
  }

  return out.sort(byPriority);
}

function newsToInsights(items: PlayerNewsItem[]): InsightRecommendation[] {
  return items.map((item) => ({
    id: `news-${item.id}`,
    type: "news" as const,
    priority: /out|doubtful|ir|injur/i.test(item.headline) ? "high" : "medium",
    title: item.headline,
    summary: item.description ?? `Source: ${item.source}`,
    reasoning: [
      item.description ?? "Headline from public ESPN feed.",
      `Source: ${item.source}. Gridiron IQ never invents injury details.`,
      item.playerNames.length
        ? `Matched roster players: ${item.playerNames.join(", ")}.`
        : `Matched via team/context on your roster.`,
    ],
    newsUrl: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
  }));
}

/** Full insights bundle — start/sit, waivers, mutual trades, news, matchup notes, other. */
export function buildInsightsBundle(
  league: LeagueData,
  newsItems: PlayerNewsItem[] = [],
  trends?: Map<number, PlayerTrendView>,
): InsightsBundle {
  const team = currentTeam(league);
  if (!team) {
    return {
      startSit: [],
      trades: [],
      waivers: [],
      news: [],
      matchupNotes: [],
      other: [],
    };
  }

  const startSit = buildStartSit(league, team);
  // Fold trend notes into start/sit reasoning when available
  if (trends?.size) {
    for (const insight of startSit) {
      for (const pid of insight.relatedPlayerIds ?? []) {
        const player = rosterPool(league).find((p) => p.id === pid);
        const t = player ? trends.get(player.espnId) : undefined;
        if (t && t.trendLabel !== "thin") {
          insight.reasoning.push(
            `Trend (${trendLabelCopy(t.trendLabel)}): ${t.rationale}`,
          );
        }
      }
    }
  }

  return {
    startSit,
    trades: buildRealisticTrades(league, team, trends),
    waivers: buildWaiverShark(league, team, newsItems),
    news: newsToInsights(newsItems),
    matchupNotes: buildMatchupNotes(league, team),
    other: buildOther(league, team),
  };
}

/** Flat list for older call sites (dashboard teasers, etc.). */
export function generateInsights(league: LeagueData): InsightRecommendation[] {
  const bundle = buildInsightsBundle(league, []);
  return [
    ...bundle.waivers,
    ...bundle.startSit,
    ...bundle.trades,
    ...bundle.matchupNotes,
    ...bundle.other,
  ].sort(byPriority);
}

export function leaguePositionalAverages(
  league: LeagueData,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const pos of SKILL_POSITIONS) {
    result[pos] = Number(avgProjected(league.teams, pos).toFixed(1));
  }
  return result;
}
