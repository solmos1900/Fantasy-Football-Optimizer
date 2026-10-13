# Data sources & attribution

Gridiron IQ only stores stats we can attribute. **Null beats fake** — missing usage stays null until a real feed lands. We never invent FantasyPros/SportsDataIO labels or seed fabricated box scores for live leagues.

## Sources in use

| Source | What we store | License / notes |
|--------|---------------|-----------------|
| **ESPN Fantasy** (user sync) | League projected / actual PPR on `PlayerWeekStat` (`leagueId` = league) | User-authorized league cookies; ESPN owns league scoring |
| **ESPN public scoreboard** | Opponent labels for finished weeks | Unofficial public site API |
| **nflverse** (`nflverse-data` releases) | Usage proxies on league-agnostic rows (`leagueId = ""`): targets, receptions, carries, yards, target share, air yards, optional snap % | **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)** — cite [nflverse/nflverse-data](https://github.com/nflverse/nflverse-data) |
| **Demo seed** | Guest/demo only; labeled `source=demo` | Never used for live ESPN leagues |

## nflverse ingest (Track 2 / PR D)

- **Crosswalk:** `Player.gsisId` ← nflverse `gsis_id`; join to ESPN via `players.csv` `espn_id`.
- **Weekly usage:** HTTPS fetch of `stats_player/stats_player_week_{season}.csv.gz` (Node/TS only — no Python on the Vercel request path).
- **Rows:** `PlayerWeekStat` with `leagueId = ""`, `source = "nflverse"`. Does **not** write `projectedPpr` / `actualPpr` (ESPN sync still owns those).
- **Merge:** When a league-scoped ESPN row already exists for the same player/week, nflverse only **fills null usage columns** — never overwrites non-null usage or PPR.
- **Cron:** `GET /api/cron/nflverse-usage` (Bearer `CRON_SECRET`) — one season/week per invocation.
- **CLI:** `npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --week 4`

### Attribution (required)

> Player usage statistics are provided by [nflverse](https://github.com/nflverse) / [nflverse-data](https://github.com/nflverse/nflverse-data), licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

## Insights tab field → source map

| UI field | Source | Notes |
|---------|--------|-------|
| Weekly PPR points (completed weeks) | ESPN league sync → `PlayerWeekStat` (`leagueId` = league) | Real 0 kept; missing → DNP / — (never fake 0) |
| Current-week **Proj (Sleeper)** | Sleeper public projections API | When feed returns empty shells → **—** (never relabel ESPN as Sleeper) |
| Injury / status chips | ESPN roster `injuryStatus` | Q/D/O/IR semantic colors |
| Bye cells | ESPN public scoreboard (`BYE` opponent) | |
| Target share / snap % / air yards | nflverse → `PlayerWeekStat` (`leagueId=""`) | Air-yards **share** = player airYards / team week sum |
| Routes % / RZ touches | nflverse columns when present | Currently often null → **—** |
| Matchup chip (`vs DAL 28th`) | nflverse actualPpr joined by opponent × position, last 4 completed weeks, ranked 1–32 | Tertiles tough/avg/soft; no Vegas |
| Waiver watch opportunity | nflverse targets+carries last 2 weeks among league free agents | |
| Freshness label | Same pattern as no-league tools | `Stats through Week N · updated X min ago` |

## Not integrated

- FantasyPros / SportsDataIO (paid commercial — do not scrape or fake)
- Sleeper commercial projections when the public feed is empty (show —; do not invent)
