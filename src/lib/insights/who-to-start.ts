import type {
  FantasyPlayer,
  FantasyTeam,
  LeagueData,
  PlayerPosition,
  PlayerTrendView,
} from "@/lib/types";
import {
  analyzeDefenseMatchup,
  averageRecentPoints,
  isCompletedWeek,
  matchupContextFromLeague,
  recentFormSummary,
} from "@/lib/insights/defense-matchups";
import { parseVenue } from "@/lib/insights/player-detail";
import { humanTrendSentence } from "@/lib/insights/trend-labels";
import { formatStatusCode, injuryStatusPhrase } from "@/lib/utils";

const SKILL_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];
const FLEX_POOL: PlayerPosition[] = ["RB", "WR", "TE"];

export type WhoToStartVerdict =
  | "start_a"
  | "start_b"
  | "lean_a"
  | "lean_b"
  | "toss_up";

export type WhoToStartErrorCode =
  | "different_position"
  | "same_player"
  | "missing_player";

export interface WhoToStartSide {
  player: FantasyPlayer;
  score: number;
  projectedPoints: number;
  recentAvg: number | null;
  venueLabel: string;
  injuryNote: string | null;
  formNote: string | null;
  matchupNote: string | null;
  toughMatchup: boolean;
}

export interface WhoToStartResult {
  ok: true;
  position: PlayerPosition;
  playerA: FantasyPlayer;
  playerB: FantasyPlayer;
  sideA: WhoToStartSide;
  sideB: WhoToStartSide;
  verdict: WhoToStartVerdict;
  verdictLabel: string;
  headline: string;
  summary: string;
  reasons: string[];
  edge: number;
  dataThin: boolean;
}

export interface WhoToStartError {
  ok: false;
  code: WhoToStartErrorCode;
  message: string;
}

export type WhoToStartComparison = WhoToStartResult | WhoToStartError;

/** Positions allowed under a Start/Sit slot filter (FLEX = RB/WR/TE). */
export function positionsForSlotFilter(
  filter: PlayerPosition | "FLEX" | "ALL",
): PlayerPosition[] | null {
  if (filter === "ALL") return null;
  if (filter === "FLEX") return [...FLEX_POOL];
  return [filter];
}

export function isFlexEligible(position: PlayerPosition): boolean {
  return FLEX_POOL.includes(position);
}

function positionsComparable(
  a: PlayerPosition,
  b: PlayerPosition,
  flexMode: boolean,
): boolean {
  if (a === b) return true;
  if (flexMode && isFlexEligible(a) && isFlexEligible(b)) return true;
  return false;
}

function pool(league: LeagueData): FantasyPlayer[] {
  return [...league.teams.flatMap((t) => t.roster), ...league.freeAgents];
}

function injuryPenalty(status: FantasyPlayer["injuryStatus"]): number {
  switch (status) {
    case "OUT":
    case "IR":
    case "SUSPENSION":
      return 100;
    case "DOUBTFUL":
      return 4;
    case "QUESTIONABLE":
      return 1.5;
    default:
      return 0;
  }
}

function injuryNote(player: FantasyPlayer): string | null {
  if (player.injuryStatus === "ACTIVE") return null;
  const phrase = injuryStatusPhrase(player.injuryStatus, "listed");
  return `${player.name} is ${phrase} (from roster sync — Gridiron IQ does not invent injury details).`;
}

/**
 * Per-player start score aligned with Insights start/sit + player-detail leans:
 * projection, recent form/trend, injury, defense matchup. No invented stats.
 */
function scoreSide(
  player: FantasyPlayer,
  league: LeagueData,
  trend: PlayerTrendView | null | undefined,
): WhoToStartSide & { dataThin: boolean } {
  const context = matchupContextFromLeague(league);
  const venue = parseVenue(player.opponent);
  const matchup = analyzeDefenseMatchup(player, pool(league), context);
  const completed = (player.recentWeeks ?? []).filter((w) =>
    isCompletedWeek(w.week, context.currentWeek),
  );
  const recentAvg = averageRecentPoints(completed);
  const form = recentFormSummary(player);
  let dataThin = false;

  let score = player.projectedPoints;
  if (recentAvg != null) score = score * 0.55 + recentAvg * 0.45;
  if (trend && trend.trendLabel !== "thin" && trend.trendLabel !== "Thin") {
    score += trend.restOfSeasonAdj * 0.5;
  }
  if (matchup?.toughMatchup && (matchup.samples?.length ?? 0) > 0) {
    score -= 2.5;
  }
  score -= injuryPenalty(player.injuryStatus);

  if (
    !(trend && trend.trendLabel !== "thin" && trend.trendLabel !== "Thin") &&
    !form &&
    recentAvg == null
  ) {
    dataThin = true;
  }

  const injury = injuryNote(player);

  let matchupNote: string | null = null;
  if (matchup && matchup.samples.length > 0) {
    matchupNote = matchup.summary;
  } else {
    dataThin = true;
    matchupNote =
      matchup?.emptyReason ??
      "No similar-player defense samples available yet for this opponent.";
  }

  return {
    player,
    score,
    projectedPoints: player.projectedPoints,
    recentAvg,
    venueLabel: venue.label,
    injuryNote: injury,
    formNote:
      trend && trend.trendLabel !== "thin" && trend.trendLabel !== "Thin"
        ? humanTrendSentence(trend)
        : form,
    matchupNote,
    toughMatchup: Boolean(
      matchup && matchup.samples.length > 0 && matchup.toughMatchup,
    ),
    dataThin,
  };
}

function unavailable(player: FantasyPlayer): boolean {
  return (
    player.injuryStatus === "OUT" ||
    player.injuryStatus === "IR" ||
    player.injuryStatus === "SUSPENSION"
  );
}

function verdictFromEdge(
  edge: number,
  nameA: string,
  nameB: string,
): Pick<
  WhoToStartResult,
  "verdict" | "verdictLabel" | "headline" | "summary"
> {
  const abs = Math.abs(edge);
  const aWins = edge > 0;
  const winner = aWins ? nameA : nameB;
  const loser = aWins ? nameB : nameA;

  if (abs < 1.0) {
    return {
      verdict: "toss_up",
      verdictLabel: "TOSS-UP",
      headline: `${nameA} vs ${nameB} is basically even`,
      summary: `The edge is only ${abs.toFixed(1)} points after projection, form, injury, and matchup — either start is defensible.`,
    };
  }

  if (abs < 2.5) {
    return {
      verdict: aWins ? "lean_a" : "lean_b",
      verdictLabel: aWins ? "LEAN A" : "LEAN B",
      headline: `Lean ${winner} over ${loser}`,
      summary: `${winner} has a modest ${abs.toFixed(1)}-point edge this week after projection, recent form, injury, and defense matchup.`,
    };
  }

  return {
    verdict: aWins ? "start_a" : "start_b",
    verdictLabel: aWins ? "START A" : "START B",
    headline: `Start ${winner} over ${loser}`,
    summary: `${winner} is the clearer start — about a ${abs.toFixed(1)}-point edge once you weigh this week's projection, recent form, injury, and matchup.`,
  };
}

/**
 * Compare two players for a weekly start call.
 * Rule-based only — reuses defense matchups, trends, and form helpers.
 * Set `flexMode` to allow RB/WR/TE cross-compares (FLEX slot).
 */
export function compareWhoToStart(
  league: LeagueData,
  playerA: FantasyPlayer,
  playerB: FantasyPlayer,
  trends?: Map<number, PlayerTrendView> | Record<string, PlayerTrendView>,
  flexMode = false,
): WhoToStartComparison {
  if (playerA.id === playerB.id) {
    return {
      ok: false,
      code: "same_player",
      message: "Pick two different players to compare.",
    };
  }

  if (!positionsComparable(playerA.position, playerB.position, flexMode)) {
    return {
      ok: false,
      code: "different_position",
      message: flexMode
        ? `FLEX compares RB / WR / TE only — ${playerA.name} is ${playerA.position} and ${playerB.name} is ${playerB.position}.`
        : `Same position only — ${playerA.name} is ${playerA.position} and ${playerB.name} is ${playerB.position}. Clear one pick and choose another ${playerA.position}.`,
    };
  }

  const trendMap = toTrendMap(trends);
  const sideA = scoreSide(
    playerA,
    league,
    trendMap?.get(playerA.espnId) ?? null,
  );
  const sideB = scoreSide(
    playerB,
    league,
    trendMap?.get(playerB.espnId) ?? null,
  );

  const aOut = unavailable(playerA);
  const bOut = unavailable(playerB);

  let edge = sideA.score - sideB.score;
  let forced: ReturnType<typeof verdictFromEdge> | null = null;

  if (aOut && !bOut) {
    edge = -Math.max(3, Math.abs(edge) + 3);
    forced = {
      verdict: "start_b",
      verdictLabel: "START B",
      headline: `Start ${playerB.name} — ${playerA.name} is ${formatStatusCode(playerA.injuryStatus) === "IR" ? "on the IR" : formatStatusCode(playerA.injuryStatus)}`,
      summary: `${playerA.name} is unavailable (${injuryStatusPhrase(playerA.injuryStatus)}). Start ${playerB.name} this week.`,
    };
  } else if (bOut && !aOut) {
    edge = Math.max(3, Math.abs(edge) + 3);
    forced = {
      verdict: "start_a",
      verdictLabel: "START A",
      headline: `Start ${playerA.name} — ${playerB.name} is ${formatStatusCode(playerB.injuryStatus) === "IR" ? "on the IR" : formatStatusCode(playerB.injuryStatus)}`,
      summary: `${playerB.name} is unavailable (${injuryStatusPhrase(playerB.injuryStatus)}). Start ${playerA.name} this week.`,
    };
  } else if (aOut && bOut) {
    forced = {
      verdict: "toss_up",
      verdictLabel: "TOSS-UP",
      headline: `Both ${playerA.name} and ${playerB.name} look unavailable`,
      summary: `Both are listed ${formatStatusCode(playerA.injuryStatus)} / ${formatStatusCode(playerB.injuryStatus)}. Neither is a start until status clears.`,
    };
    edge = 0;
  }

  const call = forced ?? verdictFromEdge(edge, playerA.name, playerB.name);
  const projDelta = playerA.projectedPoints - playerB.projectedPoints;
  const formDelta =
    sideA.recentAvg != null && sideB.recentAvg != null
      ? sideA.recentAvg - sideB.recentAvg
      : null;

  const reasons: string[] = [
    call.summary,
    `Projection: ${playerA.name} ${playerA.projectedPoints.toFixed(1)} vs ${playerB.name} ${playerB.projectedPoints.toFixed(1)} (${projDelta >= 0 ? "+" : ""}${projDelta.toFixed(1)} for ${playerA.name}).`,
  ];

  if (formDelta != null) {
    reasons.push(
      `Recent form: ${playerA.name} about ${formDelta >= 0 ? "+" : ""}${formDelta.toFixed(1)} points per game vs ${playerB.name} over recent completed weeks.`,
    );
  }

  if (sideA.injuryNote) reasons.push(sideA.injuryNote);
  if (sideB.injuryNote) reasons.push(sideB.injuryNote);

  if (sideA.toughMatchup || sideB.toughMatchup) {
    if (sideA.matchupNote && sideA.toughMatchup) {
      reasons.push(`Matchup for ${playerA.name}: ${sideA.matchupNote}`);
    }
    if (sideB.matchupNote && sideB.toughMatchup) {
      reasons.push(`Matchup for ${playerB.name}: ${sideB.matchupNote}`);
    }
  } else {
    if (sideA.matchupNote && !sideA.matchupNote.startsWith("No similar")) {
      reasons.push(`${playerA.name}: ${sideA.matchupNote}`);
    }
    if (sideB.matchupNote && !sideB.matchupNote.startsWith("No similar")) {
      reasons.push(`${playerB.name}: ${sideB.matchupNote}`);
    }
  }

  // Keep side-specific form lines when they add signal beyond the delta.
  if (sideA.formNote && formDelta == null) reasons.push(sideA.formNote);
  if (sideB.formNote && formDelta == null) reasons.push(sideB.formNote);

  const dataThin = sideA.dataThin || sideB.dataThin;
  if (dataThin) {
    reasons.push(
      "Some signals are thin (short form sample or few defense comps) — treat the edge cautiously.",
    );
  }

  return {
    ok: true,
    position: playerA.position,
    playerA,
    playerB,
    sideA: {
      player: sideA.player,
      score: sideA.score,
      projectedPoints: sideA.projectedPoints,
      recentAvg: sideA.recentAvg,
      venueLabel: sideA.venueLabel,
      injuryNote: sideA.injuryNote,
      formNote: sideA.formNote,
      matchupNote: sideA.matchupNote,
      toughMatchup: sideA.toughMatchup,
    },
    sideB: {
      player: sideB.player,
      score: sideB.score,
      projectedPoints: sideB.projectedPoints,
      recentAvg: sideB.recentAvg,
      venueLabel: sideB.venueLabel,
      injuryNote: sideB.injuryNote,
      formNote: sideB.formNote,
      matchupNote: sideB.matchupNote,
      toughMatchup: sideB.toughMatchup,
    },
    ...call,
    reasons,
    edge,
    dataThin,
  };
}

function toTrendMap(
  trends?: Map<number, PlayerTrendView> | Record<string, PlayerTrendView>,
): Map<number, PlayerTrendView> | undefined {
  if (!trends) return undefined;
  if (trends instanceof Map) return trends;
  const map = new Map<number, PlayerTrendView>();
  for (const [key, value] of Object.entries(trends)) {
    const id = Number(key);
    if (!Number.isNaN(id)) map.set(id, value);
  }
  return map;
}

/** My Team same-position (or FLEX pool) starters/bench as optional quick picks. */
export function samePositionSuggestions(
  team: FantasyTeam,
  position: PlayerPosition | "FLEX",
  excludeIds: Set<string> = new Set(),
): FantasyPlayer[] {
  const allowed =
    position === "FLEX" ? FLEX_POOL : ([position] as PlayerPosition[]);
  return [...team.roster]
    .filter(
      (p) =>
        allowed.includes(p.position) &&
        p.slot !== "IR" &&
        !excludeIds.has(p.id),
    )
    .sort((a, b) => {
      if (Boolean(a.isStarter) !== Boolean(b.isStarter)) {
        return a.isStarter ? -1 : 1;
      }
      return b.projectedPoints - a.projectedPoints;
    });
}

export function isComparablePosition(position: PlayerPosition): boolean {
  return SKILL_POSITIONS.includes(position) || position === "K" || position === "D/ST";
}
