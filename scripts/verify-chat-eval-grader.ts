/**
 * Offline guard for the chat eval (no model, no network, no DB):
 * - 50 cases, unique ids, expected players exist in the fixture pool
 * - Every expected tool call runs against the fixture context and returns
 *   real data (so a model that calls the right tool gets real numbers)
 * - Oracle replies built only from tool output grade as 0 hallucinated
 *   numbers and pass tool accuracy
 * - Fabricated numbers, wrong tools, wrong ids and forbidden calls are caught
 * Run: npm run verify:chat-eval-grader
 */

import assert from "node:assert/strict";
import { EVAL_CASES, type EvalCase } from "../eval/chat/cases";
import { buildEvalContext, EVAL_PLAYER_BY_ID } from "../eval/chat/fixtures";
import {
  extractNumbers,
  gradeNumbers,
  gradeToolCalls,
  type ObservedCall,
} from "../eval/chat/grader";
import { buildChatTools } from "../src/lib/chat/tools";

assert.equal(EVAL_CASES.length, 50, "eval has 50 questions");
assert.equal(new Set(EVAL_CASES.map((c) => c.id)).size, 50, "case ids unique");

type AnyTool = { execute: (input: unknown, opts: unknown) => Promise<unknown> };
const toolsFor = (c: EvalCase) =>
  buildChatTools(buildEvalContext(c.context)) as unknown as Record<
    string,
    AnyTool
  >;

/** The canonical call for an expected call (first listed tool). */
function oracleCall(c: EvalCase): ObservedCall[] {
  return c.calls.flatMap((e): ObservedCall[] => {
    const tool = e.tool[0]!;
    if (e.sides)
      return [
        {
          toolName: tool,
          input: { leftEspnIds: e.sides[0], rightEspnIds: e.sides[1] },
        },
      ];
    if (tool === "compare_who_to_start")
      return [{ toolName: tool, input: { espnIds: e.ids } }];
    if (tool === "player_outlook" || tool === "waiver_outlook") {
      return (e.ids ?? []).map((id) => ({
        toolName: tool,
        input: { espnId: id },
      }));
    }
    return [{ toolName: tool, input: {} }];
  });
}

/** One-line reply that only restates numbers present in the tool result. */
function oracleReply(result: unknown): string {
  const r = result as Record<string, unknown>;
  if (typeof r.headline === "string") return r.headline;
  if (r.kind === "outlook" || r.kind === "waiver") {
    if (r.ok === false) return String(r.message);
    const p = r.player as {
      label: string;
      seasonPpg: number | null;
      sleeperProj: number | null;
    };
    return `${p.label}: ${p.seasonPpg == null ? "—" : p.seasonPpg.toFixed(1)} points per game, projected ${
      p.sleeperProj == null ? "—" : p.sleeperProj.toFixed(1)
    } this week.`;
  }
  if (r.kind === "roster")
    return `${r.teamName} has ${(r.players as unknown[]).length} players.`;
  if (r.kind === "league-teams") {
    const t = (
      r.teams as { name: string; record: string; standing: number }[]
    )[0]!;
    return `${t.name} is ${t.record}, standing ${t.standing}.`;
  }
  return typeof r.message === "string" ? r.message : "Done.";
}

const SYSTEM_CONTEXT = "Stats through Week 10 · updated just now";

async function main() {
  let oracleNumbers = 0;
  for (const c of EVAL_CASES) {
    // Expected players exist (unknown-player cases are meant to miss).
    for (const e of c.calls) {
      for (const id of [...(e.ids ?? []), ...(e.sides?.flat() ?? [])]) {
        if (c.category !== "unknown_player") {
          assert.ok(
            EVAL_PLAYER_BY_ID.has(id),
            `${c.id}: player ${id} in fixture`,
          );
        }
      }
    }
    assert.ok(c.prompt.length > 5, `${c.id}: prompt`);

    const tools = toolsFor(c);
    const calls = oracleCall(c);
    const results: unknown[] = [];
    for (const call of calls) {
      const t = tools[call.toolName];
      assert.ok(t, `${c.id}: tool ${call.toolName} exists`);
      const out = await t.execute(call.input, {
        toolCallId: "oracle",
        messages: [],
      });
      results.push(out);
      const ok = (out as { ok?: boolean }).ok;
      if (
        c.category === "unknown_player" &&
        call.toolName !== "compare_who_to_start"
      ) {
        assert.equal(ok, false, `${c.id}: unknown player → not found`);
      } else if (c.category === "league_gate") {
        assert.equal(
          (out as { kind?: string }).kind,
          "league-gate",
          `${c.id}: gated`,
        );
      } else if (c.category !== "unknown_player") {
        assert.equal(
          ok,
          true,
          `${c.id}: ${call.toolName} returns data: ${JSON.stringify(out).slice(0, 200)}`,
        );
      }
    }

    const tool = gradeToolCalls(c, calls);
    assert.ok(
      tool.pass,
      `${c.id}: oracle calls pass (${JSON.stringify(tool)})`,
    );

    const reply =
      results.map(oracleReply).join(" ") ||
      "Happy to help with trades, start/sit and waivers.";
    const nums = gradeNumbers(reply, {
      toolResults: results,
      prompt: c.prompt,
      systemContext: SYSTEM_CONTEXT,
    });
    oracleNumbers += nums.numbers.length;
    assert.deepEqual(
      nums.hallucinated.map((n) => n.raw),
      [],
      `${c.id}: oracle reply "${reply}" has no ungrounded numbers`,
    );
  }
  assert.ok(
    oracleNumbers >= 40,
    `oracle replies exercise the number grader (${oracleNumbers})`,
  );

  // ── Adversarial: the grader must catch these ──────────────────────────────
  const byId = (id: string) => EVAL_CASES.find((c) => c.id === id)!;
  {
    const c = byId("trap-01");
    const tools = toolsFor(c);
    const out = await tools.player_outlook!.execute(
      { espnId: 900301 },
      { toolCallId: "x", messages: [] },
    );
    const fabricated =
      "Kendrick Sato (CIN) has 9 touchdowns and 812 receiving yards, averaging 20.0 points per game.";
    const g = gradeNumbers(fabricated, {
      toolResults: [out],
      prompt: c.prompt,
      systemContext: SYSTEM_CONTEXT,
    });
    const flagged = g.hallucinated.map((n) => n.raw);
    assert.ok(flagged.includes("812"), `812 yards flagged (${flagged})`);
    assert.ok(flagged.includes("20.0"), `wrong PPG 20.0 flagged (${flagged})`);
    // 9 may coincidentally round-match a fixture value; the grader is per-value.
  }
  {
    // Precision: 19.84 displays as 19.8 (or 20); 19.9 and 19.7 are wrong.
    for (const [shown, ok] of [["19.8", true], ["20", true], ["19.84", true], ["19.9", false], ["19.7", false]] as const) {
      const g = gradeNumbers(`Projected ${shown}.`, { toolResults: [{ proj: 19.84 }], prompt: "", systemContext: "" });
      assert.equal(g.hallucinated.length === 0, ok, `${shown} vs 19.84`);
    }
    const g3 = gradeNumbers("Gap is 47%.", {
      toolResults: [{ pctGap: 0.4655 }],
      prompt: "",
      systemContext: "",
    });
    assert.equal(g3.hallucinated.length, 0, "fraction shown as percent");
    const g4 = gradeNumbers("Edge of 3.5 points.", {
      toolResults: [{ a: 17.2, b: 13.7 }],
      prompt: "",
      systemContext: "",
    });
    assert.equal(
      g4.hallucinated.length,
      1,
      "model arithmetic counts as ungrounded (strict)",
    );
    assert.equal(
      g4.hallucinated[0]!.derivable,
      true,
      "…but is marked derivable",
    );
  }
  {
    // Chips, position-rank labels and 49ers are not stats.
    const t = extractNumbers(
      "Start @[900301|Kendrick Sato (CIN)] as your WR2 over the 49ers D, 1,250 yards, 12.5%",
    );
    assert.deepEqual(
      t.map((x) => x.raw),
      ["1,250", "12.5%"],
    );
    assert.equal(t[0]!.value, 1250);
    assert.equal(t[1]!.percent, true);
  }
  {
    const c = byId("trade-01");
    const right = {
      toolName: "analyze_trade",
      input: { leftEspnIds: [900201], rightEspnIds: [900301] },
    };
    const swapped = {
      toolName: "analyze_trade",
      input: { leftEspnIds: [900301], rightEspnIds: [900201] },
    };
    const wrongIds = {
      toolName: "analyze_trade",
      input: { leftEspnIds: [900201], rightEspnIds: [900302] },
    };
    const wrongTool = {
      toolName: "compare_who_to_start",
      input: { espnIds: [900201, 900301] },
    };
    assert.ok(gradeToolCalls(c, [right]).pass);
    assert.ok(gradeToolCalls(c, [swapped]).pass, "either orientation");
    assert.ok(!gradeToolCalls(c, [wrongIds]).pass, "wrong ids fail");
    assert.ok(!gradeToolCalls(c, [wrongTool]).pass, "wrong tool fails");
    assert.ok(!gradeToolCalls(c, []).pass, "no call fails");
  }
  {
    const c = byId("chat-01");
    assert.ok(gradeToolCalls(c, []).pass);
    assert.ok(
      !gradeToolCalls(c, [
        { toolName: "player_outlook", input: { espnId: 900301 } },
      ]).pass,
    );
    const gate = byId("gate-01");
    assert.ok(gradeToolCalls(gate, []).pass, "gate: no call is fine");
    assert.ok(
      gradeToolCalls(gate, [{ toolName: "my_roster", input: {} }]).pass,
    );
    assert.ok(
      !gradeToolCalls(gate, [
        { toolName: "my_roster", input: {} },
        { toolName: "player_outlook", input: { espnId: 900301 } },
      ]).pass,
      "gate: analysis call forbidden",
    );
    const start = byId("start-02");
    assert.ok(
      !gradeToolCalls(start, [
        {
          toolName: "compare_who_to_start",
          input: { espnIds: [900301, 900204] },
        },
      ]).pass,
      "missing a player fails",
    );
    const w5 = byId("waiver-05");
    assert.ok(
      gradeToolCalls(w5, [
        { toolName: "waiver_outlook", input: { espnId: 900203 } },
        { toolName: "waiver_outlook", input: { espnId: 900205 } },
      ]).pass,
      "two outlook calls cover a two-player set",
    );
  }

  console.log(
    `verify:chat-eval-grader OK (50 cases, ${oracleNumbers} oracle numbers grounded)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
