# Projection snapshots & PPR trend analyst

Aligned to the **PPR Fantasy Intelligence** research brief. Gridiron IQ stores weekly **projected vs actual PPR** in Neon so trade / start-sit advice cites accumulated samples — not invented third-party accuracy claims.

## Schema (preferred)

| Model | Role |
|-------|------|
| `Player` | Canonical ESPN-id player identity |
| `PlayerWeekStat` | Weekly `projectedPpr`, `actualPpr`, `projectionDelta`, optional usage (`targets`, shares, snaps, airYards, RZ) |
| `PlayerTrendSnapshot` | `Rising` \| `Stable` \| `Fading` \| `BoomBust` \| `InjuryRisk` \| `Thin` + `evidenceSentence`, `factJson`, `judgmentJson` |
| `DefenseWeekAllow` | Defense fantasy points allowed by week/position (matchup SOS) |
| `LeagueConnection` | ESPN/demo connection + cached payload (kept; not the only truth) |

Migration: `prisma/migrations/20260923020000_research_player_week_trend/` (replaces the earlier snapshot/metric table names).

## Sources (honest)

| Source | Use |
|--------|-----|
| **ESPN Fantasy** (user-auth sync) | Primary projected + actual PPR |
| **Demo seed** | Guest/demo `recentWeeks` |
| **Heuristic** | Fill missing past projections; marked `source=heuristic` |
| **nflverse** | Reserved usage fields — free feed when wired |
| **FantasyPros / SportsDataIO** | Paid commercial only — **not** integrated; never scrape or fake labels |
| **Sleeper** | Free non-commercial — do not ship commercial Sleeper use without a license |

## Trend judgment rank (do not invert)

1. Injury / role  
2. Target / rush / snap trajectory (3-game vs season) — fall back to actual-PPR slope when usage null  
3. Red-zone (when present)  
4. SOS / matchup (`DefenseWeekAllow` + in-memory defense comps)  
5. Hot/cold vs projection — **only with** usage/form context; never outranks #1–2  

`factJson` = measurable evidence. `judgmentJson` = ordered conclusions for the UI.

## Trade rules (full PPR, 1QB)

- Surplus → need; improve **starters**, not spreadsheet win%.  
- Reject naked QB ↔ skill 1:1 (especially QB ↔ WR1).  
- 2-for-1 ≈ star with **≤10% premium**, and **both package pieces startable**.  
- Scarcity chips: elite TE ≈ locked RB1 > volume WR1 > QB.  
- Mutually beneficial copy: For you / For them / Why accepted.  
- Half-PPR: only matters when it flips TE / pass-catching RB leans (ESPN `appliedTotal` already reflects league settings when synced).

## How trends update

1. League sync/connect  
2. Insights / player detail load (best-effort)  
3. `POST /api/trends/refresh`

## How managers should read recommendations

- Verdict + bullets: **facts first**, then judgment.  
- No fake win%. Labels describe **your stored sample**.  
- Thin / Injury risk means wait or sit — don’t overfit one game.  
- Waivers only recommend in-league available FAs.

## Code map

| Path | Role |
|------|------|
| `src/lib/insights/trends.ts` | Week stat upsert + trend derivation |
| `src/lib/insights/trades.ts` | Full-PPR trade engine (research norms) |
| `src/lib/insights/engine.ts` | Insights bundle |
| `src/components/trend-panel.tsx` | Spark + table |
| `src/app/api/trends/refresh/route.ts` | On-demand refresh |
