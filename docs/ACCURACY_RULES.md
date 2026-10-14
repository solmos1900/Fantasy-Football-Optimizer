# Accuracy rules (owner)

Running list of hard rules every Insights / Who-to-Start / Trade change must follow.
If a PR violates any rule, it is not merge-ready.

## Display

1. **Full name + NFL team always** — chips, tap details, Roster Pulse, Waiver Watch, trade cards, Who to Start. Never last-only (`Brown`), suffix-only (`III`), bare name without team, or position-rank (`WR2`, `RB1`). Free agents use `(FA)`. **Every chip anywhere must name the subject player + team** (Roster Pulse included), e.g. `Tetairoa McMillan (CAR): ↑ getting 41% of team targets (up from 22%): more catches`, `Woody Marks (HOU): ↑ More touches: David Montgomery (HOU) out`, `Jermar Jefferson (FA)`.
2. **Freshness label** — always show `Stats through Week N · updated …` and current NFL week. Guests/no-league get the same pattern as connected tools.
3. **Fantasy-impact wording (strong)** — every metric and label must state its **direct fantasy impact**. No one should need context clues. Pattern: **what happened + what it means for this player's points**, in a few words. Numbers stay visible. No jargon or abbreviations (`Opp ↑/↓`, `TGT%`, `AY%`, `CAR+TGT`, `szn`, `3wk`).
   - Good: `↑ Getting 25% of team targets (up from 21%): more catches`
   - Good: `↓ On field 54% of plays (down from 57%): fewer chances`
   - Good: `@JAX: 7th-toughest vs RBs (W2–5): expect fewer points`
   - Good: `Last 3 games avg 11.8 vs season 16.2: trending down`
   - Good: `Projected 15.3 this week (Sleeper)`
   - Good: `Trending down: 27% below season average`
   - Good: `Sell-high: scoring 30% above season average without more usage; trade value may drop`
   - Good: `↑ More targets: Alec Pierce (IND) on IR` → tap: `Alec Pierce (IND) is on IR. He had 12% of team targets; Josh Downs (IND) should pick up some of them.`
   - Bad: `Opp ↑ Pierce IR`, `Tgt% 25/21`, `vs JAX 7th`, bare `FADING` / `STEADY` with no reason.
   - Volume word: **touches** for RB, **targets** for WR/TE.

## Scoring & weeks

4. **Full PPR** — no-league / Insights strips use **nflverse box-score full PPR** (`actualSource=nflverse_ppr`). Connected leagues may show league-scored points but must **label** the scoring. Never silent half-PPR / standard; never prefer ESPN `appliedTotal` over category / nflverse full PPR for the public pool.
5. **Latest completed week post-MNF** — after every game in week N is final, load week N into completed strips (or show an **explicit missing-week notice**). Do not hard-cap at `currentWeek - 1` when the scoreboard says N is done.
6. **Identical week axes** — every player strip shares the same W1…Wn (+ Proj) scaffold. No per-player trimmed axes.
7. **No 0 for BYE / DNP / null** — missing weeks are BYE, DNP, or `—`. Never coerce null/absent to `0`. A completed week with snaps but null PPR is `empty` (`—`), not DNP; fill PPR from ESPN gamelog when available without overwriting `nflverse_ppr`.
8. **Matchup venue** — DVP chips use scoreboard `vs` / `@` (e.g. `@ATL`) and state impact (`expect fewer points` / `expect more points`).

## Integrity

9. **No fabricated comps or grades** — no seeded “similar player” boxes, no invented DVP ranks, no LLM letter grades on trade cards. Rule-based chips only; null → `—`.
10. **No dual proj/actual bars** — one week-axis strip (completed weeks + current Proj). Do not overlay proj-vs-actual dual bars.
11. **No guest league data** — guests never see another user’s league rosters, scores, or sync cookies. No-league tools use the public NFL pool + freshness only.

## Golden accuracy gate

- Fixture: `tests/fixtures/golden-players.json` (researcher fills real values).
- Local / CI: `npm run verify:golden` — fails when Insights / Who-to-Start / Trade inputs for fixture players (team, opponent, weekly PPR, targets, carries) disagree with the fixture.
- See `tests/fixtures/README.md`.

## Changelog

| Date | Rule / note |
|------|-------------|
| 2026-10-13 | Initial list from Insights redesign + teammate injury owner requirements. |
| 2026-10-13 | Added golden fixture + `verify:golden` CI gate. |
| 2026-10-13 | Root cause: ESPN `appliedTotal` overwrote nflverse full-PPR (e.g. Burrow W1 8.8 vs 14.16, Swift W1 9.5 vs 32.4). Prefer `nflverse_ppr`; label strips Full PPR (nflverse). Tuesday cron re-validates golden sample + Insights notice. |
| 2026-10-13 | Fantasy-impact wording rule: every label states what happened + points impact; replaced Opp ↑/↓ jargon and TGT%/AY%/szn/3wk abbreviations. |
