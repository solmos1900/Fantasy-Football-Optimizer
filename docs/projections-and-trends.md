# Projection snapshots and PPR trend analyst

This doc explains how Gridiron IQ stores each player’s weekly **projected** vs **actual** fantasy points, and how those samples turn into trend labels and trade advice. It is for anyone who wants to know what “proj vs actual” means in the product — not only for engineers.

**Projected** = what ESPN (or a marked heuristic fill) expected the player to score that week.  
**Actual** = what they really scored after the game.  
The app saves those pairs so start/sit and trade notes can cite your league’s own history instead of inventing third-party accuracy claims.

This app assumes **full PPR** (receptions = 1 point) and **1QB redraft** (start one quarterback; league resets yearly).

---

## How the data is stored

Each week, for players in your synced (or demo) league, the app can keep:

- Identity for the player (ESPN id, and optional other ids)
- That week’s projected and actual PPR points, the gap between them, and where each number came from
- A trend snapshot: a short label (Rising, Stable, and so on), ranked judgment scores, a plain-English evidence sentence, and JSON used by the product
- Defense points allowed by week and position (for matchup context)
- Your league connection and its cached ESPN/demo payload

Contributors map those ideas to Prisma models `Player`, `PlayerWeekStat`, `PlayerTrendSnapshot`, `DefenseWeekAllow`, and `LeagueConnection`. Migrations: `20260923020000_research_player_week_trend`, `20260923030000_research_brief_field_parity`.

---

## Sources (honest)

| Source | What it’s for |
|--------|----------------|
| **ESPN Fantasy** (your sync) | Primary projected and actual PPR points |
| **ESPN public scoreboard** | Opponent labels for finished weeks in defense comps (no API key) |
| **Demo seed** | Guest/demo recent weeks only (labeled Demo; never used for live ESPN leagues) |
| **Heuristic** | Fill missing past projections; marked `source=heuristic` so you can tell |
| **nflverse** | Usage columns on `PlayerWeekStat` (`leagueId=""`) via cron/CLI — CC-BY attribution; see [DATA_SOURCES.md](../DATA_SOURCES.md) |
| **FantasyPros / SportsDataIO** | Paid commercial only — **not** integrated; never scrape or fake those labels |
| **Sleeper** | Free non-commercial — do not ship commercial Sleeper use without a license |

---

## Trend labels (what you see)

| Label | Plain meaning |
|-------|----------------|
| **Rising** | Scoring has been heating up vs recent weeks |
| **Stable** | Scoring looks steady — no strong up or down swing |
| **Fading** | Scoring has been cooling off vs recent weeks |
| **BoomBust** | High volatility — big weeks mixed with quiet ones |
| **InjuryRisk** | Injury report / role risk — sit or have a backup ready |
| **Thin** | Not enough finished games yet to trust a trend |

Labels describe **your stored sample**, not a paid expert consensus ranking.

---

## Judgment rank (do not invert)

When the app ranks why a trend looks the way it does, it prefers signals in this order:

1. **Injury / role** (`injuryRoleScore`) — Is the player hurt or losing a clear role?
2. **Usage trajectory** (`usageTrajectory`) — Are targets, rushes, or snaps trending up or down? (Form-slope proxy until full usage data lands.)
3. **Red-zone** (`redZoneScore`, may be empty) — Goal-line opportunity when we have it.
4. **Strength of schedule / matchup** (`sosScore` + `DefenseWeekAllow`) — Who they faced or face.
5. **Hot/cold vs projection** (`hotColdScore`) — Beating or missing projections — **only with** usage/form context.

Hot scoring with flat usage ⇒ **Boom-Bust**, not Rising.

---

## Trade rules (full PPR, 1QB)

Same chip model as the Trades page in the app. **Chip value** = the app’s internal “how valuable for trading right now” score (not ESPN points, not auction dollars). Built mainly from rest-of-season / recent form, with a smaller weight on this week’s projection, plus injury context.

In plain English:

- Prefer deals that move a **surplus** (you are deep at a position) toward a **need** (you are thin there). Improve who you actually start — not a spreadsheet that only looks good on paper.
- Reject naked quarterback-for-skill 1-for-1 swaps (especially QB for a top WR). In a one-QB league that is usually a bad idea.
- A 2-for-1 only looks fair if both pieces you send are startable and the premium you pay for the star stays small. Count the cost of the bench player you may have to drop.
- Scarcity order on this chip scale: elite TE ≈ locked RB1 > high-volume WR1 > QB.
- Advice should say who benefits (for you / for them) and why the deal would be accepted; optional alternate players you could send instead.
- Half-PPR: only call it out when it would flip a TE or pass-catching RB lean. When ESPN sync is live, `appliedTotal` already reflects that league’s settings.
- No fake win%. Verdict plus a short list of facts, then judgment (capped in the product).

Exact formula constants stay private.

---

## How trends update

1. League sync or connect  
2. Insights or player detail load (best-effort write)  
3. On-demand `POST /api/trends/refresh`

---

## How managers should read recommendations

- Labels describe **your stored sample**, not a paid ECR.
- Thin or Injury risk → wait or sit; don’t overfit one game.
- Waivers only recommend free agents available in your league.

---

## Code map (contributors)

| Path | Role |
|------|------|
| `src/lib/insights/trends.ts` | Save weekly proj/actual rows and derive ranked trend labels |
| `src/lib/insights/trades.ts` | Full-PPR trade suggestion engine (Insights ideas) |
| `src/lib/insights/engine.ts` | Builds the Insights page bundle |
| `src/components/trend-panel.tsx` | Sparkline + week table in the UI |
| `src/app/api/trends/refresh/route.ts` | On-demand trend refresh endpoint |
