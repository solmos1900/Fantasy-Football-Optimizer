# Accuracy rules (owner)

Running list of hard rules every Insights / Who-to-Start / Trade change must follow.
If a PR violates any rule, it is not merge-ready.

## Display

1. **Full name + NFL team always** — chips, tap details, Roster Pulse, Waiver Watch, trade cards. Never last-only (`Brown`), suffix-only (`III`), or position-rank (`WR2`, `RB1`). Example: `Opp ↑ David Montgomery (HOU) D`, `Amon-Ra St. Brown (DET)`.
2. **Freshness label** — always show `Stats through Week N · updated …` and current NFL week. Guests/no-league get the same pattern as connected tools.

## Scoring & weeks

3. **Full PPR** — no-league / Insights strips use **nflverse box-score full PPR** (`actualSource=nflverse_ppr`). Connected leagues may show league-scored points but must **label** the scoring. Never silent half-PPR / standard; never prefer ESPN `appliedTotal` over category / nflverse full PPR for the public pool.
4. **Latest completed week post-MNF** — after every game in week N is final, load week N into completed strips (or show an **explicit missing-week notice**). Do not hard-cap at `currentWeek - 1` when the scoreboard says N is done.
5. **Identical week axes** — every player strip shares the same W1…Wn (+ Proj) scaffold. No per-player trimmed axes.
6. **No 0 for BYE / DNP / null** — missing weeks are BYE, DNP, or `—`. Never coerce null/absent to `0`. A completed week with snaps but null PPR is `empty` (`—`), not DNP; fill PPR from ESPN gamelog when available without overwriting `nflverse_ppr`.
6b. **Matchup venue** — DVP chips use scoreboard `vs` / `@` (e.g. `@ATL`), and ranks read `7th-toughest vs RB (W2–5)`.

## Integrity

7. **No fabricated comps or grades** — no seeded “similar player” boxes, no invented DVP ranks, no LLM letter grades on trade cards. Rule-based chips only; null → `—`.
8. **No dual proj/actual bars** — one week-axis strip (completed weeks + current Proj). Do not overlay proj-vs-actual dual bars.
9. **No guest league data** — guests never see another user’s league rosters, scores, or sync cookies. No-league tools use the public NFL pool + freshness only.

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
