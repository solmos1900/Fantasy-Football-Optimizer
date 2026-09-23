import type {
  FantasyPlayer,
  LeagueData,
  PlayerPosition,
  PlayerTrendView,
} from "@/lib/types";
import {
  analyzeDefenseMatchup,
  averageRecentPoints,
  inferPlayerRole,
  recentFormSummary,
} from "@/lib/insights/defense-matchups";
import { trendLabelCopy } from "@/lib/insights/trend-labels";

export type StartSitLean = "START" | "SIT" | "FLEX";

export interface PlayerDetailInsight {
  lean: StartSitLean;
  headline: string;
  reasons: string[];
  dataThin: boolean;
  matchupSummary: string | null;
  formSummary: string | null;
  comps: {
    week: number;
    playerName: string;
    points: number;
    role: string;
    /** Concrete sentence: who scored what vs that defense in which week */
    blurb: string;
  }[];
  venue: {
    abbrev: string | null;
    venue: "home" | "away" | "unknown";
    label: string;
  };
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

function positionPhrase(position: PlayerPosition, role: string): string {
  if (position === "WR") {
    if (role === "wr_slot") return "slot wide receiver";
    if (role === "wr_outside") return "outside wide receiver";
    return "wide receiver";
  }
  if (position === "RB") return role === "rb2" ? "RB2 / committee back" : "running back";
  if (position === "QB") return "quarterback";
  if (position === "TE") return "tight end";
  return position;
}

export function parseVenue(opponent?: string): {
  abbrev: string | null;
  venue: "home" | "away" | "unknown";
  label: string;
} {
  if (!opponent?.trim()) {
    return { abbrev: null, venue: "unknown", label: "Opponent TBD" };
  }
  const raw = opponent.trim();
  const venue = raw.startsWith("@")
    ? "away"
    : /^vs\.?\s+/i.test(raw)
      ? "home"
      : "unknown";
  const abbrev = raw
    .replace(/^vs\.?\s*/i, "")
    .replace(/^@\s*/i, "")
    .trim()
    .toUpperCase();
  const label =
    venue === "away"
      ? `@ ${abbrev}`
      : venue === "home"
        ? `vs ${abbrev}`
        : abbrev;
  return { abbrev: abbrev || null, venue, label };
}

function toComps(
  player: FantasyPlayer,
  defenseAbbrev: string | null,
  samples: {
    week: number;
    playerName: string;
    points: number;
    role: string;
    position?: PlayerPosition;
  }[],
) {
  return samples.slice(0, 4).map((s) => {
    const role = roleLabel(s.role);
    const phrase = positionPhrase(s.position ?? player.position, s.role);
    const def = defenseAbbrev ?? "that";
    const blurb = `${s.playerName} (${phrase}) only got ${s.points.toFixed(1)} PPR against the ${def} defense in week ${s.week}.`;
    return {
      week: s.week,
      playerName: s.playerName,
      points: s.points,
      role,
      blurb,
    };
  });
}

/**
 * Start/Sit lean for a single player using projection, recent form, injury,
 * and similar-player vs defense comps. Never invents points — only stored
 * recentWeeks / seeded defense history / roster injury flags.
 */
export function buildPlayerDetailInsight(
  league: LeagueData,
  player: FantasyPlayer,
  trend?: PlayerTrendView | null,
): PlayerDetailInsight {
  const matchup = analyzeDefenseMatchup(player, pool(league));
  const form = recentFormSummary(player);
  const recentAvg = averageRecentPoints(player.recentWeeks);
  const venue = parseVenue(player.opponent);
  const defenseAbbrev = venue.abbrev ?? matchup?.opponent ?? null;
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
      comps: toComps(player, defenseAbbrev, matchup?.samples ?? []),
      venue,
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
    `This week projection: ${player.projectedPoints.toFixed(1)} PPR (${venue.label}).`,
  );

  if (trend && trend.trendLabel !== "thin") {
    reasons.push(
      `Stored trend: ${trendLabelCopy(trend.trendLabel)} — ${trend.rationale}`,
    );
  }

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

  const comps = toComps(player, defenseAbbrev, matchup?.samples ?? []);

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
  if (trend) score += trend.restOfSeasonAdj * 0.5;
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
    venue,
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
