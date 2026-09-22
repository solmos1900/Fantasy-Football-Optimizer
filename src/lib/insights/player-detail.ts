import type { FantasyPlayer, LeagueData, PlayerPosition } from "@/lib/types";
import {
  analyzeDefenseMatchup,
  averageRecentPoints,
  inferPlayerRole,
  recentFormSummary,
} from "@/lib/insights/defense-matchups";

export type StartSitLean = "START" | "SIT" | "FLEX";

export interface PlayerDetailInsight {
  lean: StartSitLean;
  headline: string;
  reasons: string[];
  dataThin: boolean;
  matchupSummary: string | null;
  formSummary: string | null;
  comps: { week: number; playerName: string; points: number; role: string }[];
}

function pool(league: LeagueData): FantasyPlayer[] {
  return [...league.teams.flatMap((t) => t.roster), ...league.freeAgents];
}

function roleLabel(role: string): string {
  switch (role) {
    case "wr_slot":
      return "slot WR";
    case "wr_outside":
      return "outside WR";
    case "rb1":
      return "RB1";
    case "rb2":
      return "RB2";
    case "qb":
      return "QB";
    case "te":
      return "TE";
    default:
      return role;
  }
}

/**
 * Start/Sit lean for a single player using projection, recent form, injury,
 * and similar-player vs defense comps. Never invents points — only stored
 * recentWeeks / seeded defense history / roster injury flags.
 */
export function buildPlayerDetailInsight(
  league: LeagueData,
  player: FantasyPlayer,
): PlayerDetailInsight {
  const matchup = analyzeDefenseMatchup(player, pool(league));
  const form = recentFormSummary(player);
  const recentAvg = averageRecentPoints(player.recentWeeks);
  const reasons: string[] = [];
  let dataThin = false;

  if (player.injuryStatus === "OUT" || player.injuryStatus === "IR") {
    return {
      lean: "SIT",
      headline: `Sit ${player.name} — listed ${player.injuryStatus}`,
      reasons: [
        `Roster injury status is ${player.injuryStatus}. Gridiron IQ does not invent injury details.`,
        `Projection is ${player.projectedPoints.toFixed(1)}; treat as unavailable until status flips.`,
      ],
      dataThin: false,
      matchupSummary: matchup?.summary ?? null,
      formSummary: form,
      comps: (matchup?.samples ?? []).slice(0, 4).map((s) => ({
        week: s.week,
        playerName: s.playerName,
        points: s.points,
        role: roleLabel(s.role),
      })),
    };
  }

  if (player.injuryStatus === "DOUBTFUL") {
    reasons.push(
      `${player.name} is DOUBTFUL — lean Sit unless you get a late upgrade (status from roster sync).`,
    );
  } else if (player.injuryStatus === "QUESTIONABLE") {
    reasons.push(
      `${player.name} is QUESTIONABLE — monitor inactive reports; lean Flex until confirmed.`,
    );
  }

  reasons.push(
    `This week projection: ${player.projectedPoints.toFixed(1)} PPR${player.opponent ? ` (${player.opponent})` : ""}.`,
  );

  if (recentAvg != null) {
    reasons.push(
      `Recent form avg ${recentAvg.toFixed(1)} PPR across last scored weeks.`,
    );
  } else {
    dataThin = true;
    reasons.push(
      "Prior-week scoring history is thin for this player — leaning more on projection + defense comps.",
    );
  }

  if (form) reasons.push(form);

  const comps =
    matchup?.samples.slice(0, 4).map((s) => ({
      week: s.week,
      playerName: s.playerName,
      points: s.points,
      role: roleLabel(s.role),
    })) ?? [];

  if (matchup) {
    reasons.push(matchup.summary);
    if (matchup.toughMatchup) {
      reasons.push(
        `Defense history flags a tough ${roleLabel(matchup.role)} matchup vs ${matchup.opponent}.`,
      );
    }
  } else {
    dataThin = true;
    reasons.push(
      "No similar-player defense samples available yet for this opponent — matchup lean is weaker.",
    );
  }

  reasons.push(`Role used for comps: ${roleLabel(inferPlayerRole(player))}.`);

  let score = player.projectedPoints;
  if (recentAvg != null) score = score * 0.55 + recentAvg * 0.45;
  if (matchup?.toughMatchup) score -= 2.5;
  if (player.injuryStatus === "QUESTIONABLE") score -= 1.5;
  if (player.injuryStatus === "DOUBTFUL") score -= 4;

  const flexible: PlayerPosition[] = ["RB", "WR", "TE"];
  let lean: StartSitLean = "START";
  if (player.injuryStatus === "DOUBTFUL" || score < 7) lean = "SIT";
  else if (score < 10 && flexible.includes(player.position)) lean = "FLEX";
  else if (matchup?.toughMatchup && score < 12) lean = "FLEX";

  const headline =
    lean === "START"
      ? `Start lean: ${player.name}`
      : lean === "FLEX"
        ? `Flex lean: ${player.name}`
        : `Sit lean: ${player.name}`;

  return {
    lean,
    headline,
    reasons,
    dataThin,
    matchupSummary: matchup?.summary ?? null,
    formSummary: form,
    comps,
  };
}

export function findPlayerInLeague(
  league: LeagueData,
  playerId: string,
): { player: FantasyPlayer; teamName: string | null } | null {
  for (const team of league.teams) {
    const player = team.roster.find((p) => p.id === playerId);
    if (player) return { player, teamName: team.name };
  }
  const fa = league.freeAgents.find((p) => p.id === playerId);
  if (fa) return { player: fa, teamName: null };
  return null;
}
