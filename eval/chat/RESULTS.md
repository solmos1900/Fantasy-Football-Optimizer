# Chat eval results

How to run: `npm run eval:chat -- --reps 3` (see `scripts/eval-chat.ts`). The 50 questions are in `eval/chat/cases.ts` and the grader is in `eval/chat/grader.ts`. Every player and stat in the eval is fictional, so the model can't answer from memory: any number it states has to come from a tool.

## Latest: 2026-11-10, production chat model (`google/gemini-2.5-flash` via Vercel AI Gateway)

50 questions × 3 reps = 150 runs. 149 were graded; 1 gateway 5xx was excluded as an infrastructure error. Every run was served by the requested model.

| Metric | Result |
| --- | --- |
| Tool-call accuracy (right tool, right players, nothing forbidden) | **98.0%** (146/149); roster questions then fixed → 9/9 on rerun |
| Replies the grader flagged for an ungrounded number | **0.7%** (1/149) |
| Numbers stated / flagged | 246 / 1 |
| Invented stats on manual review of every flagged reply | **0** |
| Cost per question (gateway pricing × real tokens) | **$0.00096** (all 149 runs priced) |
| Total eval cost | $0.14 |
| Avg tokens per question | 1,799 in / 187 out |
| Latency p50 / p95 | 2.5 s / 4.4 s |

| Category | Runs | Tool accuracy | Replies flagged |
| --- | --- | --- | --- |
| trade | 29 | 100% | 0 |
| start_sit | 30 | 100% | 0 |
| outlook | 24 | 100% | 0 |
| waiver | 15 | 100% | 1 |
| roster | 9 | 67% → 100% after fix | 0 |
| league_teams | 6 | 100% | 0 |
| league_gate | 9 | 100% | 0 |
| unknown_player | 9 | 100% | 0 |
| stat_trap | 12 | 100% | 0 |
| no_tool | 6 | 100% | 0 |

**The flagged number:** waiver-03 #2 said "8.2 points per game in his last 3, compared to 6.9 for the season". The grader skips window phrases that end in a noun ("last 3 games" / "outings" / "weeks"), but not a bare "last 3", so it flagged the 3. That 3 is a game count, not a stat. 8.2, 6.9 and the 7.9 projection all match the tool output. Left as is so the headline stays strict.

**Roster failures (fixed):** in 3 of 6 runs of "Any injured players on my team?" and "Which of my running backs should I start?", the model asked the user to list players instead of calling `my_roster`.
- The fix: the `my_roster` tool description now says it returns injury status and is for any question about the user's own team, and the system prompt says to call it first for "my team" questions.
- Rerun of the 3 roster questions × 3 reps: 9/9 correct ("No players on your team are currently injured", which is right for the fixture roster; "Start Marcus Vell (ATL) over Bryce Lindqvist (CHI) and Quincy Harlow (LAR)").
- The other 47 questions weren't rerun after this prompt change.

## History

### Run 1: 2026-11-10 03:41 UTC, before the stat-trap fix
- 149 graded runs; tool accuracy **92.0%** (137/149). Everything passed except the 4 stat-trap questions, 0/12.
- Stat traps ask for stats the tools don't return (touchdowns, targets, yards, completion %). The model correctly refused to invent them, but it called no tool, so the user got no numbers at all.
- The fix: system-prompt rule 2b says to still call `player_outlook`, say the stat isn't available, and answer from what the tool returns. Rerun: 12/12.
- The grader flagged 6 replies. Every flag was the "3" in "last 3 game average" (the name of a metric the tool offers), not a stated stat. The grader now skips "last N games/outings/weeks/starts" window labels; `verify:chat-eval-grader` keeps testing that the value next to such a label is still graded. Re-scoring run 1's saved transcripts with the fixed grader: **0 of 208 numbers ungrounded**.
- Cost per question $0.00095; p50 latency 2.3 s.

## Grader limits
- Grounding matches values, not meaning. A small whole number can match an unrelated tool value, such as a week number, so for small integers "0 ungrounded" is a lower bound on mistakes. That's why every flagged reply gets a manual review.
- Questions use @ chips with ESPN ids, as the chat composer sends them. Typed player names without a chip aren't covered: the chat has no name-lookup tool yet.
- Comparing other models (`--model anthropic/claude-haiku-5.5`) needs paid AI Gateway credits; on the free tier, only some models are available.
