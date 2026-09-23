# Projection snapshots & PPR trend analyst

Gridiron IQ stores weekly **projected vs actual PPR** history in Neon Postgres so trade / start-sit advice can cite real accumulated samples — not invented third-party accuracy claims.

## Schema

### `PlayerProjectionSnapshot`

One row per `(espnId, season, week, leagueId)`:

| Field | Meaning |
|-------|---------|
| `projectedPpr` | Projected fantasy points for that week (ESPN `statSourceId=1`, demo seed, or **heuristic** fill) |
| `actualPpr` | Actual league scoring / PPR when available (ESPN `statSourceId=0` or demo) |
| `targets` / `carries` / `targetShare` | Optional usage proxies (often null until ESPN stats expose them) |
| `source` | `espn` \| `demo` \| `heuristic` |
| `leagueId` | League scope (`demo-league` for demo; ESPN league id for live) |

### `PlayerTrendMetric`

Rolling derived metrics per `(espnId, season, leagueId)`:

- `avgProjected`, `avgActual`, `avgDelta` (actual − projected)
- `recentFormAvg`, `trendLabel` (`hot` / `cold` / `boom` / `bust` / `rising` / `falling` / `steady` / `thin`)
- `usageTrend` (slope of recent actuals)
- `restOfSeasonAdj` — small additive full-PPR chip nudge for trade valuing
- `rationale` — plain-language explanation shown in UI

Migration: `prisma/migrations/20260923010000_player_projection_trends/`.

## How trends update (Vercel-friendly)

No fragile long cron. Refresh happens:

1. **On league sync / connect** (`src/lib/league/service.ts`) — after ESPN or demo payload is cached.
2. **On Insights / player detail load** — best-effort `refreshProjectionTrends(league)`.
3. **On-demand API** — `POST /api/trends/refresh` (authenticated). `GET` returns the current trend map.

Practical flow for managers:

1. Sync league → this week’s projections are stored.
2. After the week scores → next sync fills `actualPpr` and past-week ESPN projected totals when present.
3. Open Insights → Trend analyst section + trade cards cite the stored history.

## Projection sources (honest labeling)

| Source | When used |
|--------|-----------|
| **ESPN Fantasy league API** | Live leagues: weekly `appliedTotal` for projected (`statSourceId=1`) and actual (`statSourceId=0`) |
| **Demo seed** | Guest/demo: `recentWeeks` with optional `projectedPoints` |
| **Heuristic** | Past week has actual but no stored projection — fill with rolling recent average and mark `source=heuristic` |

**Never** label UI as FantasyPros / CBS / etc. unless that feed is actually integrated.

Scoring assumption: **full PPR** chip blend in trades (`65%` this-week projection + `35%` recent actual), with QBs heavily discounted in 1QB leagues. Half-PPR leagues still work if ESPN’s `appliedTotal` already reflects league settings.

## How managers should read recommendations

- **Trend labels** describe *your stored sample*, not a guaranteed ROS rank.
- **Beating / under proj** (`boom` / `bust`) needs weeks with *both* projected and actual.
- **Hot / cold / rising / falling** lean on recent actual slope + form vs season average.
- **Trade cards** prefer same-position / need-based packages, block naked QB↔skill 1:1, and may nudge value with `restOfSeasonAdj` when samples exist.
- **Thin sample** means wait for more syncs — don’t overfit early weeks.

## Code map

| Path | Role |
|------|------|
| `src/lib/insights/trends.ts` | Snapshot upsert + trend derivation |
| `src/lib/insights/trades.ts` | Full-PPR trade engine + trend blurbs |
| `src/lib/insights/engine.ts` | Insights bundle (passes trend map) |
| `src/components/trend-panel.tsx` | Spark + proj/actual table |
| `src/app/api/trends/refresh/route.ts` | On-demand refresh API |
| `docs/projections-and-trends.md` | This document |
