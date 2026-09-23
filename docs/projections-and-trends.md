# Projection snapshots & PPR trend analyst

Aligned to the **PPR Fantasy Intelligence** research brief
(`gridiron-iq-ppr-research-brief-2026-09-22`, 2026-09-22).
Gridiron IQ stores weekly **projected vs actual PPR** in Neon so trade / start-sit
advice cites accumulated samples — not invented third-party accuracy claims.

## Schema (preferred)

| Model | Role |
|-------|------|
| `Player` | ESPN-id identity (`espnId`, optional `espnPlayerId` / `sleeperId`) |
| `PlayerWeekStat` | Weekly `projectedPpr`, `actualPpr`, `projectionDelta`, `scoringFormat`, usage columns (targets/shares/snaps/airYards/RZ…), `projectionSource` / `actualSource` |
| `PlayerTrendSnapshot` | `Rising` \| `Stable` \| `Fading` \| `BoomBust` \| `InjuryRisk` \| `Thin` + ranked scores + `evidenceSentence` + `factJson` / `judgmentJson` |
| `DefenseWeekAllow` | Defense points allowed by week/position (SOS) |
| `LeagueConnection` | ESPN/demo connection + cached payload (kept; not the only truth) |

Migrations: `20260923020000_research_player_week_trend`, `20260923030000_research_brief_field_parity`.

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

1. Injury / role (`injuryRoleScore`)  
2. Target / rush / snap trajectory — form-slope proxy until usage lands (`usageTrajectory`)  
3. Red-zone (`redZoneScore`, nullable)  
4. SOS / matchup (`sosScore` + `DefenseWeekAllow`)  
5. Hot/cold vs projection (`hotColdScore`) — **only with** usage/form context  

Hot scoring + flat usage ⇒ **Boom-Bust**, not Rising.

## Trade rules (full PPR, 1QB)

- Surplus → need; improve **starters**, not spreadsheet win%.  
- Reject naked QB ↔ skill 1:1 (especially QB ↔ WR1).  
- 2-for-1 ≈ star with **≤10% premium**, and **both package pieces startable**; debit bench/drop cost.  
- Chip blend ~**70% ROS/form + 30% this-week** proj; scarcity elite TE ≈ locked RB1 > volume WR1 > QB.  
- Mutually beneficial For you / For them / Why accepted; optional **alternative sendables**.  
- Half-PPR: only note when it flips TE / pass-catching RB leans (ESPN `appliedTotal` already reflects league settings when synced).  
- No fake win%. Verdict + ≤6 fact-then-judgment bullets.

## How trends update

1. League sync/connect  
2. Insights / player detail load (best-effort)  
3. `POST /api/trends/refresh`

## How managers should read recommendations

- Labels describe **your stored sample**, not a paid ECR.  
- Thin / Injury risk → wait or sit; don’t overfit one game.  
- Waivers only recommend in-league available FAs.

## Code map

| Path | Role |
|------|------|
| `src/lib/insights/trends.ts` | Week stat upsert + ranked trend derivation |
| `src/lib/insights/trades.ts` | Full-PPR trade engine (research norms) |
| `src/lib/insights/engine.ts` | Insights bundle |
| `src/components/trend-panel.tsx` | Spark + table |
| `src/app/api/trends/refresh/route.ts` | On-demand refresh |
