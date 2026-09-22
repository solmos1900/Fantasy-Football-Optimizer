import type {
  FantasyPlayer,
  FantasyTeam,
  InsightRecommendation,
  LeagueData,
  PlayerPosition,
} from "@/lib/types";

const SKILL_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];

function starters(team: FantasyTeam): FantasyPlayer[] {
  return team.roster.filter((p) => p.isStarter);
}

function bench(team: FantasyTeam): FantasyPlayer[] {
  return team.roster.filter((p) => !p.isStarter && p.slot !== "IR");
}

function avgProjectedByPosition(teams: FantasyTeam[], pos: PlayerPosition): number {
  const values: number[] = [];
  for (const team of teams) {
    const best = starters(team)
      .filter((p) => p.position === pos)
      .map((p) => p.projectedPoints);
    if (best.length) values.push(best.reduce((a, b) => a + b, 0) / best.length);
  }
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ownedIds(league: LeagueData): Set<number> {
  const ids = new Set<number>();
  for (const team of league.teams) {
    for (const p of team.roster) ids.add(p.espnId);
  }
  return ids;
}

/**
 * Rule-based recommendation engine (v1).
 * Every recommendation includes explicit, explainable reasoning strings.
 */
export function generateInsights(league: LeagueData): InsightRecommendation[] {
  const team =
    league.teams.find((t) => t.isCurrentUser) ??
    league.teams.find((t) => t.id === league.userTeamId) ??
    league.teams[0];

  if (!team) return [];

  const insights: InsightRecommendation[] = [];
  const others = league.teams.filter((t) => t.id !== team.id);

  // 1) Start / sit: bench player with higher projection than a starter at same/flex slot
  const starterList = starters(team);
  const benchList = bench(team);

  for (const b of benchList) {
    if (b.injuryStatus === "OUT" || b.injuryStatus === "IR") continue;
    const comparable = starterList.filter(
      (s) =>
        s.position === b.position ||
        (s.slot === "FLEX" && ["RB", "WR", "TE"].includes(b.position)),
    );
    const weakest = comparable.sort((a, c) => a.projectedPoints - c.projectedPoints)[0];
    if (weakest && b.projectedPoints >= weakest.projectedPoints + 1.5) {
      insights.push({
        id: `start-sit-${b.id}-${weakest.id}`,
        type: "start_sit",
        priority: b.projectedPoints - weakest.projectedPoints >= 3 ? "high" : "medium",
        title: `Consider starting ${b.name} over ${weakest.name}`,
        summary: `${b.name} projects ${b.projectedPoints.toFixed(1)} pts vs ${weakest.name}'s ${weakest.projectedPoints.toFixed(1)}.`,
        reasoning: [
          `${b.name} (${b.position}, ${b.nflTeam}) is on your bench with ${b.projectedPoints.toFixed(1)} projected points.`,
          `${weakest.name} is currently slotted at ${weakest.slot} with only ${weakest.projectedPoints.toFixed(1)} projected.`,
          `Delta of ${(b.projectedPoints - weakest.projectedPoints).toFixed(1)} points exceeds the 1.5-pt start/sit threshold.`,
          weakest.injuryStatus !== "ACTIVE"
            ? `${weakest.name} injury flag: ${weakest.injuryStatus}.`
            : `${b.name} injury status: ${b.injuryStatus}.`,
        ],
        relatedPlayerIds: [b.id, weakest.id],
      });
    }
  }

  // 2) Injury flags on starters
  for (const s of starterList) {
    if (["OUT", "DOUBTFUL", "IR"].includes(s.injuryStatus)) {
      const replacement = benchList
        .filter((b) => b.position === s.position || (s.slot === "FLEX" && ["RB", "WR", "TE"].includes(b.position)))
        .filter((b) => !["OUT", "IR"].includes(b.injuryStatus))
        .sort((a, b) => b.projectedPoints - a.projectedPoints)[0];

      insights.push({
        id: `injury-${s.id}`,
        type: "start_sit",
        priority: "high",
        title: `${s.name} is ${s.injuryStatus} — swap recommended`,
        summary: replacement
          ? `Move ${replacement.name} into the lineup.`
          : `No clear bench replacement — check free agents.`,
        reasoning: [
          `${s.name} carries an injury status of ${s.injuryStatus} but is still in a starting slot (${s.slot}).`,
          replacement
            ? `Best bench option: ${replacement.name} (${replacement.projectedPoints.toFixed(1)} proj).`
            : `Your bench has no healthy same-position replacement.`,
          `Starting injured players risks a zero and weakens weekly ceiling.`,
        ],
        relatedPlayerIds: replacement ? [s.id, replacement.id] : [s.id],
      });
    }
  }

  // 3) Weak positions vs league average
  for (const pos of SKILL_POSITIONS) {
    const myStarters = starterList.filter((p) => p.position === pos);
    if (!myStarters.length) continue;
    const myAvg =
      myStarters.reduce((a, p) => a + p.projectedPoints, 0) / myStarters.length;
    const leagueAvg = avgProjectedByPosition(league.teams, pos);
    if (leagueAvg > 0 && myAvg < leagueAvg - 2) {
      insights.push({
        id: `weak-${pos}`,
        type: "weak_position",
        priority: myAvg < leagueAvg - 4 ? "high" : "medium",
        title: `${pos} looks below league average`,
        summary: `Your ${pos} starters project ${myAvg.toFixed(1)} vs league ${leagueAvg.toFixed(1)}.`,
        reasoning: [
          `League-average starting ${pos} projection: ${leagueAvg.toFixed(1)} points.`,
          `Your starting ${pos} average: ${myAvg.toFixed(1)} points (${(myAvg - leagueAvg).toFixed(1)} gap).`,
          `Heuristic: gaps worse than −2 projected points flag a positional weakness.`,
          `Consider waiver adds or trades targeting ${pos}.`,
        ],
        relatedPositions: [pos],
        relatedPlayerIds: myStarters.map((p) => p.id),
      });
    }
  }

  // 4) Drop / add candidates
  const owned = ownedIds(league);
  const dropCandidates = benchList
    .filter((p) => p.percentOwned < 35 || p.injuryStatus === "OUT" || p.projectedPoints < 4)
    .sort((a, b) => a.projectedPoints - b.projectedPoints);

  const addCandidates = league.freeAgents
    .filter((fa) => !owned.has(fa.espnId))
    .filter((fa) => fa.projectedPoints >= 8 || fa.percentOwned >= 30)
    .sort((a, b) => b.projectedPoints - a.projectedPoints);

  for (let i = 0; i < Math.min(2, dropCandidates.length, addCandidates.length); i++) {
    const drop = dropCandidates[i];
    const add = addCandidates[i];
    if (!drop || !add) continue;
    if (add.projectedPoints < drop.projectedPoints + 1) continue;

    insights.push({
      id: `drop-add-${drop.id}-${add.id}`,
      type: "drop_add",
      priority: add.projectedPoints - drop.projectedPoints >= 4 ? "high" : "medium",
      title: `Drop ${drop.name} → add ${add.name}`,
      summary: `${add.name} projects ${add.projectedPoints.toFixed(1)} vs ${drop.name}'s ${drop.projectedPoints.toFixed(1)}.`,
      reasoning: [
        `${drop.name} is benched with ${drop.projectedPoints.toFixed(1)} projected and ${drop.percentOwned.toFixed(0)}% ownership.`,
        drop.injuryStatus !== "ACTIVE"
          ? `Drop candidate injury status: ${drop.injuryStatus}.`
          : `Low utilization / projection makes roster spot costly.`,
        `${add.name} is available (${add.percentOwned.toFixed(0)}% owned) projecting ${add.projectedPoints.toFixed(1)}.`,
        `Projection uplift: +${(add.projectedPoints - drop.projectedPoints).toFixed(1)} points if the add earns a role.`,
      ],
      relatedPlayerIds: [drop.id, add.id],
    });
  }

  // 5) Mismatch vs opponent (matchup score projections)
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
      insights.push({
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
            ? `You are favored by ${delta.toFixed(1)} — avoid unnecessary hero benches; lock in high-floor plays.`
            : `You are underdogs by ${Math.abs(delta).toFixed(1)} — prioritize ceiling plays and consider boom/bust flex options.`,
          `Based on ESPN projected team totals for week ${matchup.week}.`,
        ],
      });
    }
  }

  // 6) Streaming K / D/ST if low projection
  for (const pos of ["K", "D/ST"] as PlayerPosition[]) {
    const mine = starterList.find((p) => p.position === pos);
    if (!mine) continue;
    const betterFa = league.freeAgents
      .filter((fa) => fa.position === pos && fa.projectedPoints > mine.projectedPoints + 1.5)
      .sort((a, b) => b.projectedPoints - a.projectedPoints)[0];
    if (betterFa) {
      insights.push({
        id: `stream-${pos}-${betterFa.id}`,
        type: "streaming",
        priority: "low",
        title: `Stream ${pos}: ${betterFa.name} over ${mine.name}`,
        summary: `${betterFa.name} projects ${betterFa.projectedPoints.toFixed(1)} vs ${mine.projectedPoints.toFixed(1)}.`,
        reasoning: [
          `${pos} is highly matchup-dependent; streaming is a common efficiency tactic.`,
          `Current starter ${mine.name}: ${mine.projectedPoints.toFixed(1)} projected.`,
          `Available ${betterFa.name}: ${betterFa.projectedPoints.toFixed(1)} projected (${betterFa.percentOwned.toFixed(0)}% owned).`,
          `Uplift of ${(betterFa.projectedPoints - mine.projectedPoints).toFixed(1)} points on a replaceable roster spot.`,
        ],
        relatedPlayerIds: [mine.id, betterFa.id],
        relatedPositions: [pos],
      });
    }
  }

  // Sort: high first, then medium, then low
  const rank = { high: 0, medium: 1, low: 2 };
  return insights.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

export function leaguePositionalAverages(league: LeagueData): Record<string, number> {
  const result: Record<string, number> = {};
  for (const pos of SKILL_POSITIONS) {
    result[pos] = Number(avgProjectedByPosition(league.teams, pos).toFixed(1));
  }
  return result;
}
