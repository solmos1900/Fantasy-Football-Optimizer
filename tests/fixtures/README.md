# Golden player fixtures

`golden-players.json` is the accuracy contract for Insights, Who-to-Start, and Trade Analyzer.

## Stub → assert

The committed file starts in **`mode: "stub"`** with **structure only** (`null` expected fields). A researcher should:

1. Pick real players (keep or replace the stub `espnId` / `name` rows).
2. Fill every non-null field they want enforced:
   - `expected.nflTeam`
   - `expected.opponent` (current-week scoreboard label, e.g. `vs JAX` / `@ MIA` / `BYE`)
   - `expected.weeks[]`: `week`, `actualPpr`, `targets`, `carries`, `opponent` (completed-week labels, usually abbrev)
3. Set `"mode": "assert"`.
4. Run `npm run verify:golden` against a DB that has nflverse/`PlayerWeekStat` coverage for that season.

## What the verifier compares

For each fixture player, the script loads the same league-agnostic rows Insights / Who-to-Start / Trade use (`PlayerWeekStat` with `leagueId = ""`, plus live scoreboard opponent for the current week) and fails on mismatch for any **non-null** expected field.

Tolerances:

- PPR: ±0.05
- targets / carries: exact (integers)
- team / opponent: case-insensitive; opponent strips `vs` / `@` before compare when fixture uses bare abbrevs

## Commands

```bash
npm run verify:golden
```

CI runs the same script on pull requests (see `.github/workflows/verify-golden.yml`).

While `mode` is `stub`, the job validates JSON shape only and exits 0 so PRs stay green until real values land.
