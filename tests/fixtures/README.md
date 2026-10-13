# Golden player fixtures

`golden-players.json` is the accuracy contract for Insights, Who-to-Start, and Trade Analyzer.

**Scoring:** full PPR from nflverse box-score categories (`actualSource=nflverse_ppr`).  
**Null** expected fields mean *no stat row / unknown* — never treat as `0`.

## Modes

- **`stub`** — structure only; CI exits 0.
- **`assert`** — compare non-null fields to `PlayerWeekStat` (`leagueId=""`). Prefer `nflverse_ppr` over ESPN `appliedTotal`.

## Fields

- `expected.nflTeam`
- `expected.opponent` (optional current-week label)
- `expected.weeks[]`: `week`, `actualPpr`, `targets`, `carries`, `opponent`

Tolerances: PPR ±0.06; targets/carries exact; opponent abbrevs case-insensitive (`@HOU` ≡ `HOU`).

## Commands

```bash
npm run verify:golden
```

CI: `.github/workflows/verify-golden.yml`.  
Weekly: Tuesday `/api/cron/nflverse-usage` re-runs the check and surfaces a visible Insights notice on failure.
