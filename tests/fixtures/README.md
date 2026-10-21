# Golden player fixtures

`golden-players.json` is the accuracy contract for Insights, Who-to-Start, and Trade Analyzer.

**Scoring:** full PPR from nflverse box-score categories (`actualSource=nflverse_ppr`).  
**Null** expected fields mean *no stat row / unknown* — never treat as `0`.

## Modes

- **`stub`** — structure only; CI exits 0.
- **`assert`** — compare non-null fields to `PlayerWeekStat` (`leagueId=""`). Prefer `nflverse_ppr` over ESPN `appliedTotal`. Also checks Who to Start / Trade Analyzer tool outputs for fixture players tagged with those surfaces.

## Fields

- `expected.nflTeam`
- `expected.opponent` (optional current-week label)
- `expected.weeks[]`: `week`, `actualPpr`, `targets`, `carries`, `opponent`
- `surfaces[]` (optional per player): `insights` | `who-to-start` | `trade`

## Tool surface asserts (Who to Start / Trade)

When `mode=assert`, for fixture players on `who-to-start` / `trade`:

- Full name + NFL team label (`Name (TEAM)`)
- Week PPR strip cells match fixture `actualPpr` (same `weekCellsFromPlayer` path the UI uses)
- Who to Start verdict `edge` equals the projection gap (not a defense-sample average)
- No banned jargon in reasons (`Opp`, `TGT%`, `szn`, `3wk`)
- Trade Analyzer facts include full name+team; `valueGap` matches receive−give

Tolerances: PPR ±0.06; targets/carries exact; opponent abbrevs case-insensitive (`@HOU` ≡ `HOU`).

## Commands

```bash
npm run verify:golden
```

CI: `.github/workflows/verify-golden.yml`.  
Weekly: Tuesday noon CDT (`0 17 * * 2` UTC) `/api/cron/nflverse-usage` re-runs the check and surfaces a visible Insights notice on failure. Status: `GET /api/health/data-freshness`.
