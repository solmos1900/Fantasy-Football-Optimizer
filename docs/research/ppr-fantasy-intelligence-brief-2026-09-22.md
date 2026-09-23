# Gridiron IQ — PPR Fantasy Intelligence Research Brief

**Product:** Gridiron IQ ([fantasyfootballoptimizer-kappa.vercel.app](https://fantasyfootballoptimizer-kappa.vercel.app))  
**Repo:** [solmos1900/Fantasy-Football-Optimizer](https://github.com/solmos1900/Fantasy-Football-Optimizer)  
**Date:** 2026-09-22 (America/Phoenix)  
**Scope:** Full-PPR default for ESPN-synced 1QB leagues; Insights (start/sit, mutual trades, waiver shark, player drill-downs) on Neon/Prisma  
**Method:** WebSearch + WebFetch of public docs/community threads; aligned to shared skill **PPR Fantasy Intelligence**. No invented API access claims.

---

## 1. Trade rules of thumb (PPR-specific)

### How good managers / r/fantasyfootball evaluate full PPR trades

Consensus from mid-season trade threads and guides on r/fantasyfootball:

- **Improve the starting lineup**, not “win” a spreadsheet. Lateral flex-for-flex with no starter upgrade is noise.
- Trade **from surplus → need**. Depth at WR that never leaves the bench is chip value; a weak RB2/Flex is the hole to fill.
- Weight **rest-of-season role + schedule** (~70%) more than next week (~30%), except near the playoff push.
- Prefer **mutually beneficial** framing: name each side’s hole in opinion language (“looks like you could use RB depth”), then give options rather than a take-it-or-leave-it smash.
- For uneven packages, community trade charts often treat a fair **2-for-1** as ~**10% more combined chip value** than the single star — but the side receiving two must actually **start both** (or drop someone worse). Always debit the player moved to the bench/waivers.
- Buy talent that is **underperforming vs expected fantasy points / opportunity** when usage is still intact; sell unsustainable TD/efficiency spikes when opportunity is flat or falling.
- Weeks ~4–5 are historically a prime trade window (records settle, overreactions peak); deadlines force schedule/bye awareness.

**Gridiron IQ already encodes the hard product norms** in `src/lib/insights/trades.ts`: no naked QB↔skill 1:1; 1QB QB chips discounted; surplus→need; 2-for-1 / 1-for-2; QB only as package sweetener; short “why this gets accepted” for both managers.

### Half-PPR differences (only when material)

Default product scoring is **full PPR**. Note half-PPR only when it flips a call:

| Signal | Full PPR | Half-PPR (material when…) |
|--------|----------|---------------------------|
| High-volume WR / slot / pass-catching RB | Premium floor; every catch is a point | Premium shrinks; yards/TDs matter more |
| Volume TE (McBride/Bowers-tier catch monsters) | Scarcity premium is largest | Premium narrows; still valuable but less “must overpay” |
| Pure rusher / deep aDOT WR | Relative discount vs full PPR | Relative upgrade vs full-PPR boards |
| QB (1QB leagues) | Relatively cheaper vs skill (skill scores more) | QB climbs slightly vs skill; still don’t 1:1 elite WR for mid QB |

Half-PPR is **not** a midpoint blend of ADP — TE pricing often stays closer to full PPR than standard. If league scoring is half, re-tier TE and pass-catching RBs before trade/start cards; otherwise keep full-PPR logic.

### When 2-for-1 makes sense

- Contender with **flex/bench logjam** needs one starter upgrade → send two startable pieces for a clear tier-up.
- Partner is **depth-poor** and can start both incoming players (or the package fills two holes).
- Values: combined chips ≈ star + ~0–10% premium; reject packages that force the 2-side to drop a better starter than they receive.
- **1-for-2** is the mirror: contender consolidates; rebuilding/depth-starved side takes volume.
- Always model **roster-spot value** (deep leagues / IR / DST streaming): getting “the one” frees a slot.

### Positional scarcity (1QB full PPR)

Rough scarcity order for trade chips (not raw PPG):

1. **Elite TE** (true TE1 with catch volume) — massive weekly gap vs streamers  
2. **RB1 / locked three-down RB** — steep cliff after RB12–24  
3. **WR1 volume** — deep position, but true high-target WR1s still win PPR floors  
4. **Top QB** — moderate; only one starter needed and waivers are deep  
5. **Replacement TE / streamer QB** — near interchangeable  

Implication: **WR depth → RB scarcity** packages clear more often than the reverse. Casual managers overvalue QBs; product should **discount QB chips** (already done) and reject “Baker for Adams”-style offers.

### QB / TE valuation quirks in PPR

- **QB:** Scoring unchanged by PPR, but **relative** value falls because RB/WR/TE score more. Value QBs by **points over waiver replacement**, not raw projection. Never recommend straight **QB ↔ WR1/RB1/TE1**. QB belongs in packages only when the partner **needs** QB and skill value still carries the deal.
- **TE:** Full PPR rewards reception volume; elite TE is a **positional cheat code**. Mid TE ≈ streamer — don’t overpay. Half-PPR: shrink the overpay slightly, don’t flip to standard logic.

### Package structures that get accepted vs joke offers

**Accepted shapes (Reddit / product norms):**

- Same-position 1:1 at adjacent tiers (WR2 ↔ WR2, slight upgrade + schedule story)  
- Skill surplus → skill need (WR3 + WR4 depth for RB2 need, etc.)  
- 2-for-1 / 1-for-2 with both sides filling starters  
- QB + skill ↔ elite skill **only** when partner needs QB  

**Joke / hard-reject shapes:**

- Straight **QB ↔ WR1** (or any naked QB↔skill 1:1)  
- Elite for mid/streamer with **tier gap ≥ 2**  
- Chip ratio roughly **> 1.55** on 1QB-discounted scale  
- “Fair by total proj” while ignoring who actually starts after the deal  

### Concrete rules of thumb (bullet list)

- Default **full PPR**; call out half-PPR only when the lean flips.  
- Optimize **starters + playoff weeks**, not total roster PPG.  
- Surplus → need; say what each roster needs before naming players.  
- **Reject** silly QB↔WR1 (and all naked QB↔skill 1:1s).  
- 2-for-1: ~fair when combined value ≈ star (+ small premium) **and** both pieces start.  
- Debit bench/drop opportunity cost on uneven trades.  
- Scarcity order: elite TE ≈ locked RB1 > volume WR1 > QB (1QB).  
- QB = sweetener or stream; TE elite = pay up, TE mid = stream.  
- Buy low on **usage-intact** underperformers; sell high on **usage-flat** TD luck.  
- Give counterpart **options** (2–4 sendable names) to raise acceptance.  
- Never invent “FantasyPros says” — separate **fact** vs **judgment**.  
- Waivers: only players **available in this ESPN league**.

---

## 2. Data fields worth storing week-by-week (Prisma/Neon friendly)

Today Gridiron IQ stores auth + `LeagueConnection.cachedPayload` (JSON snapshot). For durable Insights (trends, drill-downs, projected vs actual), promote structured week rows rather than only blob cache.

### Core week fact table (projections, actuals, over/under)

Suggested Prisma models (additive; keep `LeagueConnection`):

```prisma
model Player {
  id            String   @id @default(cuid())
  espnPlayerId  String?
  sleeperId     String?
  name          String
  position      String   // QB|RB|WR|TE|K|DST
  nflTeam       String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  weeklyStats   PlayerWeekStat[]
  trends        PlayerTrendSnapshot[]

  @@unique([espnPlayerId])
  @@index([position, nflTeam])
}

model PlayerWeekStat {
  id              String   @id @default(cuid())
  playerId        String
  season          Int
  week            Int
  scoringFormat   String   @default("PPR") // PPR | HALF_PPR | STD

  // Projections vs actuals
  projectedPpr    Float?
  actualPpr       Float?
  projectionDelta Float?   // actual - projected (signal, not destiny)
  projectionSource String? // "espn" | "fantasypros" | "internal" | ...
  actualSource    String?  // "espn_league" | "nflverse" | ...

  // Usage context (optional but required for honest trends)
  targets         Int?
  receptions      Int?
  rushingAttempts Int?
  rushingYards    Int?
  receivingYards  Int?
  airYards        Float?
  targetShare     Float?   // 0–1
  rushShare       Float?
  snapPct         Float?   // 0–1
  routePct        Float?
  redZoneTargets  Int?
  redZoneTouches  Int?
  goalLineCarries Int?
  opponent        String?
  gameScriptNote  String?  // e.g. "trailed_large"

  player          Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([playerId, season, week, scoringFormat])
  @@index([season, week])
  @@index([projectionDelta])
}

model PlayerTrendSnapshot {
  id            String   @id @default(cuid())
  playerId      String
  season        Int
  asOfWeek      Int
  label         String   // Rising | Stable | Fading | Boom-Bust | Injury risk
  evidence      String   // one sentence
  // Ranked signal strengths (nullable floats for explainability)
  injuryRoleScore   Float?
  usageTrajectory   Float? // target/rush/snap 3g vs season
  redZoneScore      Float?
  sosScore          Float?
  hotColdScore      Float? // only meaningful with usageTrajectory
  factJson      Json?    // raw supporting facts
  judgmentJson  Json?    // buy/sell/start lean — keep separate from facts
  player        Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())

  @@unique([playerId, season, asOfWeek])
}

model DefenseWeekAllow {
  id           String @id @default(cuid())
  season       Int
  week         Int
  nflTeam      String
  vsPosition   String // QB|RB|WR|TE
  pointsAllowedPpr Float?
  rankVsPos    Int?
  @@unique([season, week, nflTeam, vsPosition])
}
```

### Fields checklist by purpose

| Purpose | Store week-by-week |
|--------|---------------------|
| Projections | `projectedPpr`, `projectionSource`, scoring format |
| Actuals | `actualPpr`, box-score yards/TDs if needed for drill-down |
| Over/under | `projectionDelta`; rolling 3-week mean delta as derived view |
| Trend signals | target/rush/snap shares, RZ usage, opponent, injury/role flags |
| Start/Sit | opponent + `DefenseWeekAllow`, floor/ceiling estimates (derived) |
| Trades | not per-week rows — use current roster + ROS aggregates + bye/playoff weeks on `LeagueConnection` or league settings JSON |

### Practical ingestion path for Gridiron IQ

1. On ESPN sync: write/upsert `PlayerWeekStat` for current week from league `projectedPoints` / `actualPoints` / weekly stats when present.  
2. Nightly (or post-Monday): backfill usage from **licensed** or **nflverse** feeds — never silent scrape of FantasyPros HTML.  
3. Derive `PlayerTrendSnapshot` labels with the ranked checklist below; persist **one evidence sentence**.  
4. Keep fact columns separate from judgment JSON so UI can show “what we measured” vs “what we recommend.”

---

## 3. Free vs paid data sources + constraints

**Legal caution:** Prefer **official/licensed APIs** and **user-authorized ESPN league credentials** over aggressive scraping. Site HTML, ToS, and robots rules change; commercial redistribution usually needs a paid license even when a “free key” exists for personal prototypes.

### Source matrix (2025–2026 NFL season)

| Source | What you get | Free / usable? | Gated / restricted | Fit for Gridiron IQ |
|--------|--------------|----------------|--------------------|---------------------|
| **ESPN Fantasy (unofficial lm-api)** | Rosters, matchups, proj/actual for *user’s league* | Usable **with user league ID**; private leagues need user-supplied `SWID` + `espn_s2` | **Not** an official public product API; can break; cookies = secrets | **Primary** for league sync (already in app) |
| **ESPN site APIs** | Scoreboard, public news/injuries | Public site endpoints used by ESPN web (no key) | Unofficial; subject to change; don’t hammer | Live scores + news (already used) |
| **Sleeper API** | Leagues, rosters, players, matchups, trending adds | Free **read-only**, no token; stay under ~1000 req/min | Docs: **non-commercial** free; **commercial use requires contacting Sleeper** | Player ID map / trending; **not** a license to ship commercial projections |
| **FantasyPros API** | ECR, weekly/ROS projections (STD/PPR/HALF), player points, news | Free key for **personal non-production** prototypes; HOF = personal non-commercial production; **Commercial plan required** for paid apps / redistribution | API key (`x-api-key`); scraping their site is not a substitute for a license | Best **paid** consensus layer if Gridiron IQ goes commercial — contact sales |
| **Yahoo Fantasy API** | League/team/player/matchup via OAuth 2.0 | Access is **application-reviewed**, not walk-up free | Must apply; attribution + API Access agreement; throttling | Optional multi-platform later — not needed for ESPN-first |
| **NFL.com Fantasy** | Official Fantasy Web Services exist (`api.fantasy.nfl.com`) | Requires **app key/secret** from NFL Fantasy (not public anonymous) | ToS; scraping research pages is **not** granted by NFL legal terms | Prefer apply for key over scrape if NFL stats needed |
| **SportsDataIO / FantasyData** | Projections, fantasy points, DFS salaries, deep stats | Free trial = **scrambled**; Discovery Lab free tier = **last season only**; Fantasy ~$99/mo or $599/yr personal/hobby; live commercial = sales | No commercial redistribution on Discovery Lab; Leagues API = contract | Solid paid actuals/projections if budget allows |
| **nflverse / nflfastR / nflreadr** | Play-by-play, weekly player stats, snap counts | **Free open data** for research/apps (cite nflverse) | Still respect upstream licenses; not a fantasy “projection API” | Best free path for **usage** (targets, air yards, snaps) to pair with ESPN PPR actuals |

### Practical approach: weekly projected vs actual PPR

1. **Projected PPR (league-true):** Prefer ESPN synced projections for that league’s scoring (already PPR-aware in ESPN settings). Optionally blend a licensed consensus (FantasyPros commercial / SportsDataIO) later — label the source.  
2. **Actual PPR:** ESPN league scoring after games; backfill/validate with nflverse weekly fantasy columns if needed for players outside blob cache.  
3. **Usage context:** nflverse (targets, air yards, snap %) or paid SportsDataIO — required before labeling Rising/Fading.  
4. **Store snapshots every sync/week** so trends accumulate even if a paid API is delayed.  
5. **If no paid projection API:** keep ESPN projections + honest uncertainty copy (“league projection; sample size N weeks”) — do **not** claim FantasyPros/Sleeper free commercial rights.

### Do / don’t

- **Do:** User-authorized ESPN sync; official Yahoo/NFL keys if approved; FantasyPros/SportsDataIO with correct tier; nflverse for usage.  
- **Don’t:** Scrape FantasyPros/Yahoo/NFL projection HTML for production; reuse someone else’s API key; claim Sleeper free tier covers commercial Gridiron IQ without written OK; invent attribution.

---

## 4. Trend metrics ranked by usefulness

Skill-aligned rank for an **ESPN-synced mid-season** app (higher = more durable). Use this order in Start/Sit, trade-up/down, and player drill-downs.

| Rank | Metric | Why it matters in PPR | How analysts use it without overfit |
|------|--------|----------------------|--------------------------------------|
| **1** | **Injury / role / depth-chart news** | Changes the opportunity distribution overnight | Only act on confirmed OUT/Doubtful/IR or clear depth-chart moves; waiver shark already maps injury → available beneficiary |
| **2** | **Target share / rush share / snap % trajectory** (3-game vs season) | Opportunity drives PPR floor; stabilizes ~4–6 games | Require **direction + participation** (e.g. rising targets **and** 70%+ snaps / high routes). Ignore 1-game spikes from game script |
| **3** | **Red-zone / goal-line usage** | TD variance; separates committee backs & TE streamers | Use RZ share as **tie-breaker**, not primary rank; small samples |
| **4** | **SOS / upcoming matchups** (D vs pos) | Weekly Start/Sit & playoff trade timing | Compare similar-role players vs that defense (Gridiron IQ defense comps); don’t bench elite usage for one “tough” matchup alone |
| **5** | **Hot/cold vs ROS (projection miss streak)** | Narrative managers feel | **Only with usage context.** Hot + rising targets = Rising; hot + flat usage = sell candidate; cold + intact usage = buy-low |

### Related metrics (supporting, not above #2)

- **Air yards / aDOT / WOPR:** Ceiling & deep-shot context; in **full PPR**, target volume usually beats pure air yards for floors. Pair air-yard share with route participation (high air yards on 40% routes = trap).  
- **Snap % thresholds (WR heuristic):** &lt;50% situational only; 50–69% volatile; **70%+ snaps with 20%+ targets** ≈ high-floor PPR starter profile.  
- **Pass volume / implied team total:** Multiplies every share metric.

### Output labels (required)

Emit one of: **Rising** | **Stable** | **Fading** | **Boom-Bust** | **Injury risk** — plus **one sentence of evidence**.

Examples:

- **Rising** — “Target share 18%→24% over last 3 with snap rate holding 80%+.”  
- **Stable** — “Season-long ~22% targets; delta vs projection near zero.”  
- **Fading** — “Routes and snaps down after committee shift; RZ touches gone.”  
- **Boom-Bust** — “aDOT elevated, target share &lt;15%; needs chunk plays.”  
- **Injury risk** — “Limited in practice / questionable; role unclear until inactive list.”

### Start/Sit & trade-up/down (no overfit)

- **Start/Sit:** Floor vs ceiling **this week**; cite D-vs-pos history when available; prefer sustained usage over last box score.  
- **Trade up:** Rising or Stable underperformer with intact #1–#2 signals.  
- **Trade down:** Hot scorer with fading #2 or #1 risk; or pure TD luck (#5 without #2).  
- Never let #5 outrank #1–#2 in product priority.

---

## 5. Recommendation quality bar (explainability, uncertainty, mutually beneficial)

What makes Gridiron IQ Insights feel expert/trustworthy:

### Explainability

- Lead with a **verdict** (START / SIT / HOLD / TRADE lean) then **3–6 bullets** a manager can repeat in league chat.  
- Show **facts first** (proj, last 3 PPR, target/snap trend, injury, opponent allow) then **judgment** (why start / why the trade clears).  
- Trade cards: **For you** / **For them** / **Why this gets accepted** (already in `trades.ts`).  
- Player drill-downs: live/recent PPR, D matchup comps, Start/Sit lean **from data**, not vibes.  
- **No fake attribution** — never “FantasyPros says” unless that number was fetched from a licensed FantasyPros response.

### Uncertainty

- Prefer bands and hedges: “Lean START,” “Low confidence — 2-game sample,” not fake `93.2% win probability` without a calibrated model.  
- Surface **missing data** (no snap %, ESPN weekly stats absent, projection source = league only).  
- Cap confidence when signals conflict (e.g. hot scoring + falling snaps → Boom-Bust / fade risk, not Rising).

### Mutually beneficial framing

- Name **both** rosters’ holes; score need-fit heavily (product already does).  
- Offer **package shapes** managers accept (same-pos, skill↔skill, 2-for-1), not smash-spot “wins.”  
- Rejection copy should teach norms (“1QB leagues don’t trade WR1s for streamer QBs”) instead of only “unfair.”  
- Waivers: **Waiver Wire Shark** only for **in-league available** players; injury → opportunity, not generic top FA list.

### Product checklist before shipping a card

- [ ] Scoring assumed full PPR (or half noted)  
- [ ] Fact vs judgment separated  
- [ ] Trend label + one evidence sentence when showing form  
- [ ] Bye / lock / playoff week considered if relevant  
- [ ] Trade passes hard rejects (no QB↔WR1)  
- [ ] Waiver target is actually a free agent in this league  

---

## 6. Anti-patterns for auto-generated advice

From PPR Fantasy Intelligence skill + community failure modes — **avoid**:

- **Overfitting one good/bad game** without usage (targets/snaps/routes).  
- **Fake precision** (“93.2% trade win probability,” “locks in your chip”) without a real model.  
- **Fake attribution** (“experts agree,” “FantasyPros ranks”) when not fetched.  
- **Ignoring bye weeks, playoff weeks, or roster locks.**  
- **Recommending unavailable free agents** (must be on *this* ESPN waiver wire).  
- **Cross-position star rape / joke trades as “fair value”** — especially naked **QB ↔ WR1**.  
- **Raw projection swaps** that ignore positional scarcity and who starts after the trade.  
- Treating **hot/cold streaks** as #1 signal above injury/role and usage trajectory.  
- **Inventing injuries** or waiver beneficiaries.  
- Half-PPR logic silently applied (or ignored) when it changes TE/RB lean.  
- Air-yards-only Start/Sit in full PPR (volume usually wins floors).  
- Aggressive **HTML scraping** presented as a stable “API.”  
- Confident ROS claims early season before usage metrics stabilize (~4–6 games for target share).

---

## 7. Source links

### Product / skill context

- Gridiron IQ live app: https://fantasyfootballoptimizer-kappa.vercel.app  
- Repo: https://github.com/solmos1900/Fantasy-Football-Optimizer  
- App README (ESPN sync, Insights, trade rules): https://github.com/solmos1900/Fantasy-Football-Optimizer/blob/main/README.md  
- Prisma schema (current Neon models): https://github.com/solmos1900/Fantasy-Football-Optimizer/blob/main/prisma/schema.prisma  
- Trade engine (1QB PPR norms): https://github.com/solmos1900/Fantasy-Football-Optimizer/blob/main/src/lib/insights/trades.ts  

### Community trade norms (PPR / Reddit)

- Trading logic thread: https://www.reddit.com/r/fantasyfootball/comments/1my1bcy/trading_logic_what_is_your_logic_behind/  
- Trading problem / surplus→need discussion: https://www.reddit.com/r/fantasyfootballadvice/comments/1o93reh/fantasy_football_has_a_trading_problem/  
- Week 10 trade chart (+ ~10% 2-for-1 note, FPOE buy/sell): https://www.reddit.com/r/fantasyfootball/comments/1opd2jm/week_10_trade_chart_plus_buysell_recommendations/  
- Week 8 trade value chart (uneven trade bench debit): https://www.reddit.com/r/fantasyfootball/comments/1ockn8b/week_8_fantasy_trade_value_chart/  
- A Guide to Trading (week 4–5 window): https://www.reddit.com/r/fantasyfootball/comments/1n7ior1/a_guide_to_trading/  

### Scoring / scarcity

- PPR vs half vs standard relative QB/skill: https://www.fantasyfootballforwinners.com/2024/08/ppr-vs-half-ppr-vs-standard.html  
- Half vs full tier movers (TE emphasis): https://parlae.io/fantasy/guides/half-ppr-vs-full-ppr-vs-standard  
- PPR vs standard trading / position value: https://www.fftradeanalyzer.com/guides/ppr-vs-standard-trading  
- Position scarcity guide: https://www.fftradeanalyzer.com/guides/position-scarcity  

### Trend / Start-Sit metrics

- Snap + target share decision thresholds: https://matchupanalytics.com/snap-count-and-target-share-analysis/  
- Target share without overreacting: https://www.footballnationusa.com/post/target-share-fantasy-football-guide  
- Air yards, aDOT, WOPR, stabilization: https://fantasystartsit.com/advanced-stats-for-start-sit  
- Air yards tool context (FTN): https://ftnfantasy.com/nfl/air-yards  
- nflverse/nflfastR (open PBP): https://github.com/nflverse/nflfastR  
- nflfastR get started: https://www.nflfastr.com/articles/nflfastR.html  
- nflreadr weekly player stats: https://www.nflreadr.nflverse.com/reference/load_player_stats.html  
- nflreadr snap counts: https://www.nflreadr.nflverse.com/reference/load_snap_counts.html  

### APIs / licensing (free vs paid — verify before shipping)

- Sleeper API docs (free non-commercial; contact for commercial): https://docs.sleeper.com/  
- FantasyPros API product page: https://www.fantasypros.com/api-data/  
- FantasyPros API access tiers (free / HOF / commercial): https://support.fantasypros.com/hc/en-us/articles/49749297704475-How-do-I-request-access-to-the-FantasyPros-API  
- FantasyPros API reference: https://api.fantasypros.com/v2/docs  
- SportsDataIO developer access & Discovery Lab pricing: https://sportsdata.io/developers  
- Yahoo Fantasy Sports developer portal (apply + OAuth): https://sports.yahoo.com/developer/  
- Yahoo API access application: https://sports.yahoo.com/developer/access/  
- NFL.com legal terms: https://www.nfl.com/legal/terms/  
- NFL Fantasy projections UI (not a free scrape license): https://fantasy.nfl.com/research/projections  
- ESPN private-league cookie auth (community vignette): https://cran.r-project.org/web/packages/ffscrapr/vignettes/espn_authentication.html  
- Community ESPN API client reference: https://github.com/cwendt94/espn-api/  

### UX / trust patterns for trade advice

- RotoWire trade analyzer framing (2026): https://www.rotowire.com/football/article/fantasy-football-trade-analyzer-find-and-grade-redraft-fantasy-football-trades-in-2026-134904  
- Game theory trade guide: https://www.theidpshow.com/p/game-theory-the-definitive-guide  

---

*Brief prepared for forwarding to the Fantasy Football agent. All access claims above are as documented on the linked pages as of research date 2026-09-22; re-verify commercial licenses before production use.*
