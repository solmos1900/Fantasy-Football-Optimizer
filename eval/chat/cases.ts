/**
 * 50-question chat eval. Prompts use @ chips exactly as the chat composer
 * sends them (tools take ESPN ids; the UI resolves names to chips).
 *
 * Grading (eval/chat/grader.ts):
 * - Tool accuracy: every `calls` entry is satisfied by some tool call (name
 *   and ESPN ids match), or the model made no call where `allowNoTool`; and
 *   no call hits a tool in `forbid` ("*" = any tool).
 * - Hallucinated numbers: every number in the final reply must appear (at
 *   its displayed precision) in that turn's tool results, the user prompt,
 *   or the freshness line of the system prompt.
 */

import { chip as c } from "./fixtures";
import type { EvalContextName } from "./fixtures";

export type ToolName =
  | "analyze_trade"
  | "compare_who_to_start"
  | "player_outlook"
  | "waiver_outlook"
  | "my_roster"
  | "league_teams";

export type ExpectedCall = {
  /** Any of these tool names satisfies the call. */
  tool: ToolName[];
  /** compare_who_to_start / outlook: exact id set. */
  ids?: number[];
  /** analyze_trade: the two sides (either orientation is accepted). */
  sides?: [number[], number[]];
};

export type EvalCase = {
  id: string;
  category:
    | "trade"
    | "start_sit"
    | "outlook"
    | "waiver"
    | "roster"
    | "league_teams"
    | "league_gate"
    | "unknown_player"
    | "stat_trap"
    | "no_tool";
  context: EvalContextName;
  prompt: string;
  calls: ExpectedCall[];
  allowNoTool?: boolean;
  forbid?: (ToolName | "*")[];
};

const T: ToolName[] = ["analyze_trade"];
const W: ToolName[] = ["compare_who_to_start"];
const O: ToolName[] = ["player_outlook", "waiver_outlook"];
const WV: ToolName[] = ["waiver_outlook", "player_outlook"];
const ANALYSIS: ToolName[] = ["analyze_trade", "compare_who_to_start", "player_outlook", "waiver_outlook"];

/** Ids that are not in the player pool (tool returns "not found"). */
const UNKNOWN_IDS = [912345, 923456, 934567];
const unknownChip = (id: number, label: string) => `@[${id}|${label}]`;

export const EVAL_CASES: EvalCase[] = [
  // ── Trades (10) ──────────────────────────────────────────────────────────
  { id: "trade-01", category: "trade", context: "noLeague", prompt: `Should I trade ${c(900201)} for ${c(900301)}?`, calls: [{ tool: T, sides: [[900201], [900301]] }] },
  { id: "trade-02", category: "trade", context: "noLeague", prompt: `Grade this trade: I give ${c(900204)} and get ${c(900302)} + ${c(900402)}`, calls: [{ tool: T, sides: [[900204], [900302, 900402]] }] },
  { id: "trade-03", category: "trade", context: "noLeague", prompt: `Is ${c(900101)} for ${c(900104)} a fair swap?`, calls: [{ tool: T, sides: [[900101], [900104]] }] },
  { id: "trade-04", category: "trade", context: "league", prompt: `Someone offered me ${c(900304)} for my ${c(900203)}. Accept?`, calls: [{ tool: T, sides: [[900203], [900304]] }] },
  { id: "trade-05", category: "trade", context: "noLeague", prompt: `2-for-1: ${c(900303)} and ${c(900306)} for ${c(900301)}. Who wins?`, calls: [{ tool: T, sides: [[900303, 900306], [900301]] }] },
  { id: "trade-06", category: "trade", context: "league", prompt: `trade ${c(900401)} for ${c(900402)}?`, calls: [{ tool: T, sides: [[900401], [900402]] }] },
  { id: "trade-07", category: "trade", context: "noLeague", prompt: `I'd be sending ${c(900202)} + ${c(900305)} and receiving ${c(900204)}. Good deal for me?`, calls: [{ tool: T, sides: [[900202, 900305], [900204]] }] },
  { id: "trade-08", category: "trade", context: "noLeague", prompt: `Rate the trade ${c(900207)} for ${c(900205)}. He's hurt, right?`, calls: [{ tool: T, sides: [[900207], [900205]] }] },
  { id: "trade-09", category: "trade", context: "league", prompt: `Would you do ${c(900102)} + ${c(900206)} for ${c(900101)}?`, calls: [{ tool: T, sides: [[900102, 900206], [900101]] }] },
  { id: "trade-10", category: "trade", context: "noLeague", prompt: `Who wins this one — side A: ${c(900308)}, side B: ${c(900303)}`, calls: [{ tool: T, sides: [[900308], [900303]] }] },

  // ── Start / sit (10) ─────────────────────────────────────────────────────
  { id: "start-01", category: "start_sit", context: "noLeague", prompt: `Start ${c(900201)} or ${c(900202)} this week?`, calls: [{ tool: W, ids: [900201, 900202] }] },
  { id: "start-02", category: "start_sit", context: "noLeague", prompt: `Who should I start at flex: ${c(900301)}, ${c(900204)}, or ${c(900401)}?`, calls: [{ tool: W, ids: [900301, 900204, 900401] }] },
  { id: "start-03", category: "start_sit", context: "league", prompt: `${c(900102)} vs ${c(900103)} — which QB do I play?`, calls: [{ tool: W, ids: [900102, 900103] }] },
  { id: "start-04", category: "start_sit", context: "noLeague", prompt: `Sit ${c(900307)}? Thinking ${c(900305)} instead.`, calls: [{ tool: W, ids: [900307, 900305] }] },
  { id: "start-05", category: "start_sit", context: "noLeague", prompt: `TE decision: ${c(900401)} or ${c(900403)}`, calls: [{ tool: W, ids: [900401, 900403] }] },
  { id: "start-06", category: "start_sit", context: "league", prompt: `My last flex spot: ${c(900203)} or ${c(900206)}?`, calls: [{ tool: W, ids: [900203, 900206] }] },
  { id: "start-07", category: "start_sit", context: "noLeague", prompt: `who to start ${c(900205)} ${c(900206)}`, calls: [{ tool: W, ids: [900205, 900206] }] },
  { id: "start-08", category: "start_sit", context: "noLeague", prompt: `Playoff push, need a WR: ${c(900302)}, ${c(900304)} or ${c(900306)}?`, calls: [{ tool: W, ids: [900302, 900304, 900306] }] },
  { id: "start-09", category: "start_sit", context: "noLeague", prompt: `Is ${c(900308)} a safer start than ${c(900303)}?`, calls: [{ tool: W, ids: [900308, 900303] }] },
  { id: "start-10", category: "start_sit", context: "noLeague", prompt: `Start ${c(900207)} or ${c(900203)}?`, calls: [{ tool: W, ids: [900207, 900203] }] },

  // ── Player outlook (8) ───────────────────────────────────────────────────
  { id: "outlook-01", category: "outlook", context: "noLeague", prompt: `How is ${c(900301)} doing this season?`, calls: [{ tool: O, ids: [900301] }] },
  { id: "outlook-02", category: "outlook", context: "noLeague", prompt: `What's ${c(900204)} projected for this week?`, calls: [{ tool: O, ids: [900204] }] },
  { id: "outlook-03", category: "outlook", context: "noLeague", prompt: `Is ${c(900206)} trending up?`, calls: [{ tool: O, ids: [900206] }] },
  { id: "outlook-04", category: "outlook", context: "league", prompt: `Outlook for ${c(900102)}`, calls: [{ tool: O, ids: [900102] }] },
  { id: "outlook-05", category: "outlook", context: "noLeague", prompt: `Is ${c(900205)} playing this week? What's his injury status?`, calls: [{ tool: O, ids: [900205] }] },
  { id: "outlook-06", category: "outlook", context: "noLeague", prompt: `Give me ${c(900404)}'s numbers.`, calls: [{ tool: O, ids: [900404] }] },
  { id: "outlook-07", category: "outlook", context: "noLeague", prompt: `What has ${c(900308)} averaged over his last 3 games?`, calls: [{ tool: O, ids: [900308] }] },
  { id: "outlook-08", category: "outlook", context: "noLeague", prompt: `Should I worry about ${c(900307)}?`, calls: [{ tool: O, ids: [900307] }] },

  // ── Waiver (5) ───────────────────────────────────────────────────────────
  { id: "waiver-01", category: "waiver", context: "noLeague", prompt: `Worth picking up ${c(900206)} off waivers?`, calls: [{ tool: WV, ids: [900206] }] },
  { id: "waiver-02", category: "waiver", context: "noLeague", prompt: `Waiver target check: ${c(900308)}`, calls: [{ tool: WV, ids: [900308] }] },
  { id: "waiver-03", category: "waiver", context: "league", prompt: `Should I spend FAAB on ${c(900403)}?`, calls: [{ tool: WV, ids: [900403] }] },
  { id: "waiver-04", category: "waiver", context: "noLeague", prompt: `Is ${c(900305)} a good add for the playoffs?`, calls: [{ tool: WV, ids: [900305] }] },
  { id: "waiver-05", category: "waiver", context: "noLeague", prompt: `Pick up ${c(900203)} or ${c(900205)} from free agency?`, calls: [{ tool: [...W, ...WV], ids: [900203, 900205] }], forbid: ["analyze_trade"] },

  // ── Connected league: roster (3) / teams (2) ─────────────────────────────
  { id: "roster-01", category: "roster", context: "league", prompt: "Who's on my roster?", calls: [{ tool: ["my_roster"] }] },
  { id: "roster-02", category: "roster", context: "league", prompt: "Any injured players on my team?", calls: [{ tool: ["my_roster"] }] },
  { id: "roster-03", category: "roster", context: "league", prompt: "Which of my running backs should I start this week?", calls: [{ tool: ["my_roster"] }], forbid: ["analyze_trade"] },
  { id: "teams-01", category: "league_teams", context: "league", prompt: "What are the standings in my league?", calls: [{ tool: ["league_teams"] }] },
  { id: "teams-02", category: "league_teams", context: "league", prompt: "Who's in first place and what's their record?", calls: [{ tool: ["league_teams"] }] },

  // ── No league connected: gated (3) ───────────────────────────────────────
  { id: "gate-01", category: "league_gate", context: "noLeague", prompt: "Show me my roster", calls: [{ tool: ["my_roster"] }], allowNoTool: true, forbid: ANALYSIS },
  { id: "gate-02", category: "league_gate", context: "noLeague", prompt: "What's my team's record?", calls: [{ tool: ["my_roster", "league_teams"] }], allowNoTool: true, forbid: ANALYSIS },
  { id: "gate-03", category: "league_gate", context: "noLeague", prompt: "Who leads my league in points?", calls: [{ tool: ["league_teams"] }], allowNoTool: true, forbid: ANALYSIS },

  // ── Player not in the pool (3) ───────────────────────────────────────────
  { id: "unknown-01", category: "unknown_player", context: "noLeague", prompt: `How has ${unknownChip(UNKNOWN_IDS[0]!, "Zeke Holloway (NE)")} played this year?`, calls: [{ tool: O, ids: [UNKNOWN_IDS[0]!] }], allowNoTool: true },
  { id: "unknown-02", category: "unknown_player", context: "noLeague", prompt: `What's ${unknownChip(UNKNOWN_IDS[1]!, "Malik Trent (JAX)")} projected for?`, calls: [{ tool: O, ids: [UNKNOWN_IDS[1]!] }], allowNoTool: true },
  { id: "unknown-03", category: "unknown_player", context: "noLeague", prompt: `Start ${unknownChip(UNKNOWN_IDS[2]!, "Andre Voss (TEN)")} or ${c(900202)}?`, calls: [{ tool: [...W, ...O], ids: [UNKNOWN_IDS[2]!, 900202] }], allowNoTool: true, forbid: ["analyze_trade"] },

  // ── Stat traps: asks for numbers the tools don't provide (4) ─────────────
  { id: "trap-01", category: "stat_trap", context: "noLeague", prompt: `How many touchdowns does ${c(900301)} have this season?`, calls: [{ tool: O, ids: [900301] }] },
  { id: "trap-02", category: "stat_trap", context: "noLeague", prompt: `What's ${c(900201)}'s yards per carry and snap share?`, calls: [{ tool: O, ids: [900201] }] },
  { id: "trap-03", category: "stat_trap", context: "noLeague", prompt: `How many targets did ${c(900302)} get last week?`, calls: [{ tool: O, ids: [900302] }] },
  { id: "trap-04", category: "stat_trap", context: "noLeague", prompt: `What's ${c(900104)}'s completion percentage and passing yards?`, calls: [{ tool: O, ids: [900104] }] },

  // ── No tool needed (2) ───────────────────────────────────────────────────
  { id: "chat-01", category: "no_tool", context: "noLeague", prompt: "Thanks, that helps!", calls: [], forbid: ["*"] },
  { id: "chat-02", category: "no_tool", context: "noLeague", prompt: "What kinds of questions can you answer?", calls: [], forbid: ["*"] },
];
