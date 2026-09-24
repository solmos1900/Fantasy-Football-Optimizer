import type {
  FantasyPlayer,
  LeagueData,
  PlayerPosition,
  PlayerTrendView,
} from "@/lib/types";
import {
  analyzeDefenseMatchup,
  averageRecentPoints,
  emptyDefenseMatchupMessage,
  inferPlayerRole,
  isCompletedWeek,
  matchupContextFromLeague,
  recentFormSummary,
} from "@/lib/insights/defense-matchups";
import { humanTrendSentence } from "@/lib/insights/trend-labels";
import { formatStatusCode } from "@/lib/utils";

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
    season: number;
    playerName: string;
    points: number;
    role: string;
    /** Concrete sentence: who scored what vs that defense in which week */
    blurb: string;
  }[];
  compsEmptyMessage: string | null;
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
  if (/^bye$/i.test(raw)) {
    return { abbrev: null, venue: "unknown", label: "BYE" };
  }
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
    season: number;
    playerName: string;
    points: number;
    role: string;
    position?: PlayerPosition;
  }[],
  contextSeason: number,
  isDemo: boolean,
) {
  return samples.slice(0, 4).map((s) => {
    const role = roleLabel(s.role);
    const phrase = positionPhrase(s.position ?? player.position, s.role);
    const def = defenseAbbrev ?? "that";
    const weekBit =
      s.season !== contextSeason
        ? `${s.season} week ${s.week}`
        : `week ${s.week}`;
    const demoBit = isDemo ? " (Demo)" : "";
    const blurb = `${s.playerName} (${phrase}) scored ${s.points.toFixed(1)} PPR against the ${def} defense in ${weekBit}.${demoBit}`;
    return {
      week: s.week,
      season: s.season,
      playerName: s.playerName,
      points: s.points,
      role,
      blurb,
    };
  });
}

/**
 * Start/Sit lean for a single player using projection, recent form, injury,
 * and similar-player vs defense comps. Never invents points — only completed
 * weeks from ESPN sync (or labeled demo recentWeeks) + roster injury flags.
 */
export function buildPlayerDetailInsight(
  league: LeagueData,
  player: FantasyPlayer,
  trend?: PlayerTrendView | null,
): PlayerDetailInsight {
  const context = matchupContextFromLeague(league);
  const matchup = analyzeDefenseMatchup(player, pool(league), context);
  const form = recentFormSummary(player);
  const recentAvg = averageRecentPoints(
    (player.recentWeeks ?? []).filter((w) =>
      isCompletedWeek(w.week, context.currentWeek),
    ),
  );
  const venue = parseVenue(player.opponent);
  const defenseAbbrev = venue.abbrev ?? matchup?.opponent ?? null;
  const reasons: string[] = [];
  let dataThin = false;
  const compsEmptyMessage =
    !matchup || matchup.samples.length === 0
      ? emptyDefenseMatchupMessage(
          player.position,
          defenseAbbrev,
          context.currentWeek,
        )
      : null;

  if (player.injuryStatus === "OUT" || player.injuryStatus === "IR") {
    const status = formatStatusCode(player.injuryStatus);
    return {
      lean: "SIT",
      headline:
        status === "IR"
          ? `Sit ${player.name} — on the IR`
          : `Sit ${player.name} — listed ${status}`,
      reasons: [
        status === "IR"
          ? `Roster lists them on the IR. Gridiron IQ does not invent injury details.`
          : `Roster injury status is ${status}. Gridiron IQ does not invent injury details.`,
        `Projection is ${player.projectedPoints.toFixed(1)}; treat as unavailable until status flips.`,
      ],
      dataThin: false,
      matchupSummary:
        matchup && matchup.samples.length > 0 ? matchup.summary : null,
      formSummary: form,
      comps: toComps(
        player,
        defenseAbbrev,
        matchup?.samples ?? [],
        context.season,
        Boolean(league.isDemo),
      ),
      compsEmptyMessage,
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
    `This week's projection is ${player.projectedPoints.toFixed(1)} points (${venue.label}).`,
  );

  if (trend && trend.trendLabel !== "thin" && trend.trendLabel !== "Thin") {
    reasons.push(humanTrendSentence(trend));
  } else if (recentAvg != null) {
    reasons.push(
      `${player.name} is averaging about ${recentAvg.toFixed(1)} points in recent games.`,
    );
  } else {
    dataThin = true;
    reasons.push(
      "Not enough prior-week scores yet — leaning more on this week's projection and the matchup.",
    );
  }

  if (form && !(trend && trend.trendLabel !== "thin" && trend.trendLabel !== "Thin")) {
    reasons.push(form);
  }

  const comps = toComps(
    player,
    defenseAbbrev,
    matchup?.samples ?? [],
    context.season,
    Boolean(league.isDemo),
  );

  if (matchup && matchup.samples.length > 0) {
    reasons.push(matchup.summary);
    if (matchup.toughMatchup) {
      reasons.push(
        `Defense history flags a tough ${roleLabel(matchup.role)} matchup vs ${matchup.opponent}.`,
      );
    }
  } else {
    dataThin = true;
    reasons.push(
      compsEmptyMessage ??
        "No similar-player defense samples available yet for this opponent — matchup lean is weaker.",
    );
  }

  reasons.push(
    `Comparing similar ${roleLabel(inferPlayerRole(player))}s against this defense from completed weeks only.`,
  );

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
      ? `Start ${player.name}`
      : lean === "FLEX"
        ? `Flex ${player.name}`
        : `Sit ${player.name}`;

  return {
    lean,
    headline,
    reasons,
    dataThin,
    matchupSummary:
      matchup && matchup.samples.length > 0 ? matchup.summary : null,
    formSummary: form,
    comps,
    compsEmptyMessage,
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
