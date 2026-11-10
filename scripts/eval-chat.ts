/**
 * Live chat eval: 50 questions through the production chat turn
 * (prepareChatTurn + CHAT_GENERATION_SETTINGS + real tools) against
 * synthetic fixture data, graded for tool-call accuracy and hallucinated
 * numbers. Costs real model tokens.
 *
 *   AI_GATEWAY_API_KEY=… npm run eval:chat -- [--reps 3] [--concurrency 4] [--only trade-]
 *     [--model anthropic/claude-haiku-5.5]   (default: production CHAT_MODEL_ID)
 *
 * --model swaps only the model id; prompt, tools and settings stay production.
 *
 * Writes eval/chat/results/<timestamp>/{transcripts.jsonl,errors.jsonl,summary.json,summary.md}.
 * Infra failures (network, gateway 5xx) go to errors.jsonl and are excluded
 * from the scores, never counted as model mistakes.
 */

import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { generateText, type UIMessage } from "ai";
import { EVAL_CASES, type EvalCase } from "../eval/chat/cases";
import { buildEvalContext } from "../eval/chat/fixtures";
import {
  gradeNumbers,
  gradeToolCalls,
  type NumberVerdict,
  type ObservedCall,
  type ToolGrade,
} from "../eval/chat/grader";
import { CHAT_GENERATION_SETTINGS, prepareChatTurn } from "../src/lib/chat/turn";
import { costFromUsage, getModelPricing } from "../src/lib/chat/pricing";
import { CHAT_MODEL_ID } from "../src/lib/chat/config";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const REPS = Math.max(1, Number(arg("reps") ?? 1));
const CONCURRENCY = Math.max(1, Number(arg("concurrency") ?? 4));
const ONLY = arg("only");
const MODEL = arg("model") ?? CHAT_MODEL_ID;

type Run = {
  caseId: string;
  category: EvalCase["category"];
  rep: number;
  prompt: string;
  reply: string;
  calls: ObservedCall[];
  toolResults: unknown[];
  tool: ToolGrade;
  numbers: NumberVerdict[];
  hallucinated: NumberVerdict[];
  servedModel: string | null;
  steps: number;
  usage: { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null };
  costUsd: number | null;
  latencyMs: number;
};

async function runOne(c: EvalCase, rep: number): Promise<Run> {
  const ctx = buildEvalContext(c.context);
  const messages: UIMessage[] = [
    { id: `${c.id}-${rep}`, role: "user", parts: [{ type: "text", text: c.prompt }] },
  ];
  const turn = await prepareChatTurn({ ctx, messages });
  const started = Date.now();
  const res = await generateText({
    model: MODEL,
    system: turn.system,
    messages: turn.messages,
    tools: turn.tools,
    ...CHAT_GENERATION_SETTINGS,
  });
  const latencyMs = Date.now() - started;

  const calls: ObservedCall[] = res.steps.flatMap((s) =>
    s.toolCalls.map((tc) => ({ toolName: tc.toolName, input: tc.input })),
  );
  const toolResults = res.steps.flatMap((s) => s.toolResults.map((r) => r.output));
  // Grade every text the user would see (all steps), not only the last.
  const reply = res.steps
    .map((s) => s.text)
    .filter((t) => t.trim())
    .join("\n");
  const tool = gradeToolCalls(c, calls);
  const nums = gradeNumbers(reply, {
    toolResults,
    prompt: c.prompt,
    systemContext: turn.freshnessLabel,
  });
  const usage = {
    inputTokens: res.totalUsage.inputTokens ?? null,
    outputTokens: res.totalUsage.outputTokens ?? null,
    cachedInputTokens: res.totalUsage.inputTokenDetails?.cacheReadTokens ?? null,
  };
  const costUsd = costFromUsage(
    {
      inputTokens: usage.inputTokens ?? undefined,
      outputTokens: usage.outputTokens ?? undefined,
      cachedInputTokens: usage.cachedInputTokens ?? undefined,
    },
    await getModelPricing(MODEL),
  );
  return {
    caseId: c.id,
    category: c.category,
    rep,
    prompt: c.prompt,
    reply,
    calls,
    toolResults,
    tool,
    numbers: nums.numbers,
    hallucinated: nums.hallucinated,
    servedModel: res.response?.modelId ?? null,
    steps: res.steps.length,
    usage,
    costUsd,
    latencyMs,
  };
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((100 * n) / d).toFixed(1)}%`;
}

function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    console.error("Set AI_GATEWAY_API_KEY (Vercel → AI Gateway → API Keys) to run the live eval.");
    process.exit(2);
  }
  const cases = EVAL_CASES.filter((c) => !ONLY || c.id.startsWith(ONLY));
  const jobs = cases.flatMap((c) => Array.from({ length: REPS }, (_, rep) => ({ c, rep })));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join("eval", "chat", "results", `${stamp}_${MODEL.replace(/[^a-z0-9.-]+/gi, "-")}`);
  mkdirSync(outDir, { recursive: true });
  const transcripts = path.join(outDir, "transcripts.jsonl");
  const errorsFile = path.join(outDir, "errors.jsonl");

  console.log(`chat eval: ${cases.length} cases × ${REPS} reps, model ${MODEL}, concurrency ${CONCURRENCY}`);
  const runs: Run[] = [];
  const errors: { caseId: string; rep: number; error: string }[] = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { c, rep } = jobs[next++]!;
      try {
        const run = await runOne(c, rep);
        runs.push(run);
        appendFileSync(transcripts, `${JSON.stringify(run)}\n`);
        const mark = run.tool.pass ? "✓" : "✗";
        const h = run.hallucinated.length ? ` ⚠ ungrounded: ${run.hallucinated.map((n) => n.raw).join(", ")}` : "";
        console.log(`${mark} ${c.id}#${rep} [${run.calls.map((x) => x.toolName).join(",") || "no tool"}] ${run.reply.slice(0, 110).replace(/\n/g, " ")}${h}`);
      } catch (err) {
        const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        errors.push({ caseId: c.id, rep, error });
        appendFileSync(errorsFile, `${JSON.stringify({ caseId: c.id, rep, error })}\n`);
        console.log(`! ${c.id}#${rep} infra error: ${error.slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // ── Summary ──
  const graded = runs.length;
  const toolPass = runs.filter((r) => r.tool.pass).length;
  const withNumbers = runs.filter((r) => r.numbers.length > 0);
  const hallucinatedRuns = runs.filter((r) => r.hallucinated.length > 0);
  const totalNumbers = runs.reduce((s, r) => s + r.numbers.length, 0);
  const totalUngrounded = runs.reduce((s, r) => s + r.hallucinated.length, 0);
  const derivable = runs.reduce((s, r) => s + r.hallucinated.filter((n) => n.derivable).length, 0);
  const costed = runs.filter((r) => r.costUsd != null);
  const totalCost = costed.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const served = [...new Set(runs.map((r) => r.servedModel ?? "unknown"))];
  const categories = [...new Set(EVAL_CASES.map((c) => c.category))];
  const byCategory = categories.map((cat) => {
    const rs = runs.filter((r) => r.category === cat);
    return {
      category: cat,
      runs: rs.length,
      toolAccuracy: rs.length ? rs.filter((r) => r.tool.pass).length / rs.length : null,
      hallucinatedReplies: rs.filter((r) => r.hallucinated.length > 0).length,
    };
  });
  // Per-case consistency across reps.
  const flaky = cases
    .map((c) => {
      const rs = runs.filter((r) => r.caseId === c.id);
      const passes = rs.filter((r) => r.tool.pass).length;
      return { id: c.id, passes, runs: rs.length };
    })
    .filter((x) => x.runs > 0 && x.passes > 0 && x.passes < x.runs);

  const summary = {
    generatedAt: new Date().toISOString(),
    requestedModel: MODEL,
    productionModel: MODEL === CHAT_MODEL_ID,
    servedModels: served,
    cases: cases.length,
    reps: REPS,
    gradedRuns: graded,
    infraErrors: errors.length,
    toolCallAccuracy: graded ? toolPass / graded : null,
    hallucinatedReplyRate: graded ? hallucinatedRuns.length / graded : null,
    repliesWithNumbers: withNumbers.length,
    numbersStated: totalNumbers,
    ungroundedNumbers: totalUngrounded,
    ungroundedButDerivable: derivable,
    avgToolCalls: graded ? runs.reduce((s, r) => s + r.calls.length, 0) / graded : null,
    costPerQuestionUsd: costed.length ? totalCost / costed.length : null,
    totalCostUsd: totalCost,
    pricedRuns: costed.length,
    avgInputTokens: graded ? runs.reduce((s, r) => s + (r.usage.inputTokens ?? 0), 0) / graded : null,
    avgOutputTokens: graded ? runs.reduce((s, r) => s + (r.usage.outputTokens ?? 0), 0) / graded : null,
    latencyP50Ms: quantile(runs.map((r) => r.latencyMs), 0.5),
    latencyP95Ms: quantile(runs.map((r) => r.latencyMs), 0.95),
    byCategory,
    inconsistentAcrossReps: flaky,
    failures: runs
      .filter((r) => !r.tool.pass || r.hallucinated.length > 0)
      .map((r) => ({
        caseId: r.caseId,
        rep: r.rep,
        toolPass: r.tool.pass,
        calls: r.calls,
        ungrounded: r.hallucinated.map((n) => ({ raw: n.raw, derivable: n.derivable })),
        reply: r.reply,
      })),
  };
  writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  const md = [
    `# Chat eval — ${summary.generatedAt.slice(0, 10)}`,
    "",
    `Model requested \`${MODEL}\`${MODEL === CHAT_MODEL_ID ? " (production)" : ""}, served: ${served.map((s) => `\`${s}\``).join(", ")}. ${cases.length} questions × ${REPS} reps = ${graded} graded runs (${errors.length} infra errors excluded).`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Tool-call accuracy (right tool + right players) | ${pct(toolPass, graded)} (${toolPass}/${graded}) |`,
    `| Replies with ≥1 ungrounded number (hallucinated-stat rate) | ${pct(hallucinatedRuns.length, graded)} (${hallucinatedRuns.length}/${graded}) |`,
    `| Numbers stated / ungrounded | ${totalNumbers} / ${totalUngrounded} (${derivable} of those are arithmetic on tool numbers) |`,
    `| Cost per question | ${summary.costPerQuestionUsd == null ? "unknown (no pricing)" : `$${summary.costPerQuestionUsd.toFixed(5)}`} |`,
    `| Total eval cost | $${totalCost.toFixed(4)} (${costed.length}/${graded} runs priced) |`,
    `| Avg tool calls / question | ${summary.avgToolCalls?.toFixed(2) ?? "—"} |`,
    `| Latency p50 / p95 | ${summary.latencyP50Ms ?? "—"} ms / ${summary.latencyP95Ms ?? "—"} ms |`,
    "",
    "| Category | Runs | Tool accuracy | Replies w/ ungrounded numbers |",
    "| --- | --- | --- | --- |",
    ...byCategory.map(
      (b) => `| ${b.category} | ${b.runs} | ${b.toolAccuracy == null ? "—" : `${(b.toolAccuracy * 100).toFixed(0)}%`} | ${b.hallucinatedReplies} |`,
    ),
    "",
    summary.failures.length ? "## Failures" : "No failures.",
    ...summary.failures.map(
      (f) =>
        `- **${f.caseId}#${f.rep}** tool ${f.toolPass ? "ok" : "WRONG"} [${f.calls.map((x) => `${x.toolName}(${JSON.stringify(x.input)})`).join(", ") || "no call"}]${
          f.ungrounded.length ? ` · ungrounded: ${f.ungrounded.map((u) => `${u.raw}${u.derivable ? " (derivable)" : ""}`).join(", ")}` : ""
        }\n  > ${f.reply.replace(/\n/g, " ")}`,
    ),
    "",
  ].join("\n");
  writeFileSync(path.join(outDir, "summary.md"), md);
  console.log(`\n${md}\nWrote ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
