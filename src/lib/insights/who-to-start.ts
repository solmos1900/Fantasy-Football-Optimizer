import type {
  FantasyPlayer,
  FantasyTeam,
  LeagueData,
  PlayerPosition,
  PlayerTrendView,
} from "@/lib/types";
import {
  averageRecentPoints,
  isCompletedWeek,
  matchupContextFromLeague,
  recentFormSummary,
} from "@/lib/insights/defense-matchups";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import { humanTrendSentence } from "@/lib/insights/trend-labels";
import { formatStatusCode, injuryStatusPhrase } from "@/lib/utils";
import {
  dvpMapFromRecord,
  preferredProj,
  type ToolDisplayMeta,
} from "@/lib/insights/tool-display";
import {
  dvpForPlayer,
  type DvpChip,
} from "@/lib/insights/defense-vs-position";
import {
  impactsForPlayer,
  type TeammateInjuryImpact,
  type TeammateInjuryIndex,
} from "@/lib/insights/teammate-injury";

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
  /** Composite start score (internal ranking only — not shown as "edge"). */
  score: number;
  /** Projection used for the call (Sleeper when available). */
  projectedPoints: number;
  recentAvg: number | null;
  venueLabel: string;
  injuryNote: string | null;
  formNote: string | null;
  /** DVP chip label with @/vs + fantasy impact, or thin-sample notice. */
  matchupNote: string | null;
  matchup: DvpChip | null;
  toughMatchup: boolean;
  teammateImpacts: TeammateInjuryImpact[];
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
  /**
   * Projection gap (A − B) in the same units as the displayed Sleeper / pool
   * projections. Never a defense-sample average.
   */
  edge: number;
  dataThin: boolean;
}

export interface WhoToStartError {
  ok: false;
  code: WhoToStartErrorCode;
  message: string;
}

export type WhoToStartComparison = WhoToStartResult | WhoToStartError;

export type WhoToStartOptions = {
  trends?: Map<number, PlayerTrendView> | Record<string, PlayerTrendView>;
  flexMode?: boolean;
  /** Insights-parity DVP + Sleeper meta from loadToolDisplayMeta. */
  toolMeta?: ToolDisplayMeta | null;
  teammateInjury?: TeammateInjuryIndex | null;
};

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
  const who = formatPlayerLabel(player.name, player.nflTeam);
  const phrase = injuryStatusPhrase(player.injuryStatus, "listed");
  return `${who} is ${phrase} (from roster sync — Gridiron IQ does not invent injury details).`;
}

/**
 * Per-player start score: projection, recent form/trend, injury, DVP tier.
 * Ranking only — the displayed verdict edge is always the projection gap.
 */
function scoreSide(
  player: FantasyPlayer,
  league: LeagueData,
  trend: PlayerTrendView | null | undefined,
  toolMeta: ToolDisplayMeta | null | undefined,
  teammateInjury: TeammateInjuryIndex | null | undefined,
): WhoToStartSide & { dataThin: boolean } {
  const context = matchupContextFromLeague(league);
  const dvpMap = dvpMapFromRecord(toolMeta?.dvpByKey);
  const matchup = dvpForPlayer(dvpMap, player.opponent, player.position);
  const completed = (player.recentWeeks ?? []).filter((w) =>
    isCompletedWeek(w.week, context.currentWeek),
  );
  const recentAvg = averageRecentPoints(completed);
  const form = recentFormSummary(player);
  let dataThin = false;

  const projectedPoints = preferredProj(player, toolMeta);
  let score = projectedPoints;
  if (recentAvg != null) score = score * 0.55 + recentAvg * 0.45;
  if (trend && trend.trendLabel !== "thin" && trend.trendLabel !== "Thin") {
    score += trend.restOfSeasonAdj * 0.5;
  }
  // Soft DVP nudge for ranking only — never surfaces as the verdict "edge".
  if (matchup?.tier === "tough" && matchup.rank != null) {
    score -= 2.5;
  } else if (matchup?.tier === "soft" && matchup.rank != null) {
    score += 1.5;
  }
  score -= injuryPenalty(player.injuryStatus);

  if (
    !(trend && trend.trendLabel !== "thin" && trend.trendLabel !== "Thin") &&
    !form &&
    recentAvg == null
  ) {
    dataThin = true;
  }

  let matchupNote: string | null = null;
  if (matchup) {
    matchupNote = matchup.label;
  } else if (player.opponent && (player.opponent ?? "").toUpperCase() !== "BYE") {
    dataThin = true;
    matchupNote = `${player.opponent}: matchup rank unknown`;
  } else if ((player.opponent ?? "").toUpperCase() === "BYE") {
    matchupNote = "On bye: scores 0 this week";
  } else {
    dataThin = true;
    matchupNote = "Opponent TBD";
  }

  const formNote =
    trend && trend.trendLabel !== "thin" && trend.trendLabel !== "Thin"
      ? humanTrendSentence({
          ...trend,
          playerName: formatPlayerLabel(player.name, player.nflTeam),
        })
      : form
        ? form.replace(player.name, formatPlayerLabel(player.name, player.nflTeam))
        : null;

  return {
    player,
    score,
    projectedPoints,
    recentAvg,
    venueLabel: matchup?.label?.split(":")[0]?.trim() ?? player.opponent ?? "—",
    injuryNote: injuryNote(player),
    formNote,
    matchupNote,
    matchup,
    toughMatchup: matchup?.tier === "tough",
    teammateImpacts: impactsForPlayer(teammateInjury, player.espnId),
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

function onBye(player: FantasyPlayer): boolean {
  return (player.opponent ?? "").toUpperCase() === "BYE";
}

/** Short status phrase for forced start headlines (bye / OUT / IR / …). */
function unavailablePhrase(player: FantasyPlayer): string {
  if (onBye(player)) return "on bye this week";
  const code = formatStatusCode(player.injuryStatus);
  if (code === "IR") return "on IR this week";
  if (code === "SUSPENSION") return "suspended this week";
  if (code === "OUT") return "OUT this week";
  return `${code} this week`;
}

function verdictFromProjEdge(
  projEdge: number,
  labelA: string,
  labelB: string,
): Pick<
  WhoToStartResult,
  "verdict" | "verdictLabel" | "headline" | "summary"
> {
  const abs = Math.abs(projEdge);
  const aWins = projEdge > 0;
  const winner = aWins ? labelA : labelB;
  const loser = aWins ? labelB : labelA;

  if (abs < 1.0) {
    return {
      verdict: "toss_up",
      verdictLabel: "TOSS-UP",
      headline: `${labelA} vs ${labelB} is basically even`,
      summary: `Projected gap is only ${abs.toFixed(1)} points this week (Sleeper / full PPR) — either start is defensible.`,
    };
  }

  if (abs < 2.5) {
    return {
      verdict: aWins ? "lean_a" : "lean_b",
      verdictLabel: aWins ? "LEAN A" : "LEAN B",
      headline: `Lean ${winner} over ${loser}`,
      summary: `${winner} projects ${abs.toFixed(1)} more points this week (Sleeper / full PPR). Form, injury, and matchup can still tip a close call.`,
    };
  }

  return {
    verdict: aWins ? "start_a" : "start_b",
    verdictLabel: aWins ? "START A" : "START B",
    headline: `Start ${winner} over ${loser}`,
    summary: `${winner} is the clearer start — projects ${abs.toFixed(1)} more points this week (Sleeper / full PPR).`,
  };
}

/**
 * Compare two players for a weekly start call.
 * Rule-based only. Verdict edge = projection gap (never defense-sample averages).
 */
export function compareWhoToStart(
  league: LeagueData,
  playerA: FantasyPlayer,
  playerB: FantasyPlayer,
  trendsOrOptions?:
    | Map<number, PlayerTrendView>
    | Record<string, PlayerTrendView>
    | WhoToStartOptions,
  flexModeArg = false,
): WhoToStartComparison {
  // Back-compat: (league, a, b, trends?, flexMode?)
  let options: WhoToStartOptions;
  if (
    trendsOrOptions &&
    typeof trendsOrOptions === "object" &&
    ("toolMeta" in trendsOrOptions ||
      "teammateInjury" in trendsOrOptions ||
      "flexMode" in trendsOrOptions ||
      "trends" in trendsOrOptions)
  ) {
    options = trendsOrOptions as WhoToStartOptions;
  } else {
    options = {
      trends: trendsOrOptions as
        | Map<number, PlayerTrendView>
        | Record<string, PlayerTrendView>
        | undefined,
      flexMode: flexModeArg,
    };
  }

  const flexMode = options.flexMode ?? false;
  const labelA = formatPlayerLabel(playerA.name, playerA.nflTeam);
  const labelB = formatPlayerLabel(playerB.name, playerB.nflTeam);

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
        ? `FLEX compares RB / WR / TE only — ${labelA} is ${playerA.position} and ${labelB} is ${playerB.position}.`
        : `Same position only — ${labelA} is ${playerA.position} and ${labelB} is ${playerB.position}. Clear one pick and choose another ${playerA.position}.`,
    };
  }

  const trendMap = toTrendMap(options.trends);
  const sideA = scoreSide(
    playerA,
    league,
    trendMap?.get(playerA.espnId) ?? null,
    options.toolMeta,
    options.teammateInjury,
  );
  const sideB = scoreSide(
    playerB,
    league,
    trendMap?.get(playerB.espnId) ?? null,
    options.toolMeta,
    options.teammateInjury,
  );

  const aOut = unavailable(playerA);
  const bOut = unavailable(playerB);
  const aBye = onBye(playerA);
  const bBye = onBye(playerB);
  const aDown = aOut || aBye;
  const bDown = bOut || bBye;

  // Displayed edge = projection gap only (matches the numbers on the card).
  let edge = sideA.projectedPoints - sideB.projectedPoints;
  let forced: ReturnType<typeof verdictFromProjEdge> | null = null;

  if (aDown && !bDown) {
    edge = -(Math.abs(edge) + 3);
    forced = {
      verdict: "start_b",
      verdictLabel: "START B",
      headline: `Start ${labelB}: ${labelA} is ${unavailablePhrase(playerA)}.`,
      summary: aBye
        ? `${labelA} scores 0 on bye. Start ${labelB} this week.`
        : `${labelA} is unavailable (${injuryStatusPhrase(playerA.injuryStatus)}). Start ${labelB} this week.`,
    };
  } else if (bDown && !aDown) {
    edge = Math.abs(edge) + 3;
    forced = {
      verdict: "start_a",
      verdictLabel: "START A",
      headline: `Start ${labelA}: ${labelB} is ${unavailablePhrase(playerB)}.`,
      summary: bBye
        ? `${labelB} scores 0 on bye. Start ${labelA} this week.`
        : `${labelB} is unavailable (${injuryStatusPhrase(playerB.injuryStatus)}). Start ${labelA} this week.`,
    };
  } else if (aDown && bDown) {
    forced = {
      verdict: "toss_up",
      verdictLabel: "TOSS-UP",
      headline: `Both ${labelA} and ${labelB} look unavailable`,
      summary: `Both are ${unavailablePhrase(playerA)} / ${unavailablePhrase(playerB)}. Neither is a start until status clears.`,
    };
    edge = 0;
  } else {
    // Near-even projections: let form / DVP / composite ranking break ties into leans.
    const absProj = Math.abs(edge);
    if (absProj < 1.0) {
      const scoreEdge = sideA.score - sideB.score;
      if (Math.abs(scoreEdge) >= 1.5) {
        const aWins = scoreEdge > 0;
        forced = {
          verdict: aWins ? "lean_a" : "lean_b",
          verdictLabel: aWins ? "LEAN A" : "LEAN B",
          headline: `Lean ${aWins ? labelA : labelB} over ${aWins ? labelB : labelA}`,
          summary: `Projections are within ${absProj.toFixed(1)} points (Sleeper / full PPR). Recent form, injury, and matchup lean ${aWins ? labelA : labelB} — not a defense-sample points claim.`,
        };
      }
    }
  }

  const call = forced ?? verdictFromProjEdge(edge, labelA, labelB);
  const projDelta = sideA.projectedPoints - sideB.projectedPoints;
  const formDelta =
    sideA.recentAvg != null && sideB.recentAvg != null
      ? sideA.recentAvg - sideB.recentAvg
      : null;

  const reasons: string[] = [
    call.summary,
    `Projected this week (Sleeper): ${labelA} ${sideA.projectedPoints.toFixed(1)} vs ${labelB} ${sideB.projectedPoints.toFixed(1)} (${projDelta >= 0 ? "+" : ""}${projDelta.toFixed(1)} for ${labelA}).`,
  ];

  if (formDelta != null) {
    reasons.push(
      `Recent form: ${labelA} about ${formDelta >= 0 ? "+" : ""}${formDelta.toFixed(1)} points per game vs ${labelB} over recent completed weeks (full PPR).`,
    );
  }

  if (sideA.injuryNote) reasons.push(sideA.injuryNote);
  if (sideB.injuryNote) reasons.push(sideB.injuryNote);

  if (sideA.matchupNote) {
    reasons.push(`Matchup for ${labelA}: ${sideA.matchupNote}`);
  }
  if (sideB.matchupNote) {
    reasons.push(`Matchup for ${labelB}: ${sideB.matchupNote}`);
  }

  for (const imp of sideA.teammateImpacts) {
    reasons.push(`${labelA}: ${imp.detail}`);
  }
  for (const imp of sideB.teammateImpacts) {
    reasons.push(`${labelB}: ${imp.detail}`);
  }

  if (sideA.formNote && formDelta == null) reasons.push(sideA.formNote);
  if (sideB.formNote && formDelta == null) reasons.push(sideB.formNote);

  const dataThin = sideA.dataThin || sideB.dataThin;
  if (dataThin) {
    reasons.push(
      "Some signals are thin (short form sample or unknown matchup rank) — treat the lean cautiously.",
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
      matchup: sideA.matchup,
      toughMatchup: sideA.toughMatchup,
      teammateImpacts: sideA.teammateImpacts,
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
      matchup: sideB.matchup,
      toughMatchup: sideB.toughMatchup,
      teammateImpacts: sideB.teammateImpacts,
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
