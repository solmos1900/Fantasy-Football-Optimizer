# Data sources & attribution

Gridiron IQ syncs **your** league from ESPN (cookies you provide for private leagues) and may enrich **usage** context from open nflverse releases. We do **not** invent stats, scrape paid projection sites, or rebundle commercial dumps.

## Allowed

| Source | License / terms | What we use it for |
|--------|-----------------|--------------------|
| **ESPN Fantasy** (unofficial site endpoints) | User-authorized via your cookies | Rosters, projected/actual PPR for your league |
| **ESPN public NFL scoreboard / news** | Public APIs | Opponent labels, injury/news flags |
| **[nflverse](https://github.com/nflverse)** open data ([nflverse-data releases](https://github.com/nflverse/nflverse-data/releases)) | **CC-BY** — attribute nflverse | Weekly usage: targets, receptions, carries, yards, target share, snap %, opponent |
| **DynastyProcess `db_playerids`** (via nflreadr `load_ff_playerids`) | Open ID map used by ffverse | Optional `sleeperId` / cross-provider id enrichment |
| **Sleeper public read API** | Non-commercial terms | Future connect (not usage invent) |
| **In-app demo seed** | Ours — always labeled Demo | Guest try path only |

## Not allowed / not integrated

- FantasyPros HTML scrape or paid APIs
- SportsDataIO / paid StatHead data dumps
- KTC / FantasyCalc valuation dumps
- Invented or seeded defense comps for live ESPN leagues
- Running Python (`nfl_data_py`, StreamSeb) on the Vercel request path

## nflverse usage ingest (PR D)

- **Fetch:** HTTPS CSV/CSV.GZ from official `nflverse-data` GitHub releases in Node/TypeScript (no Python on cron).
- **Crosswalk:** `player_id` (GSIS) → `Player.gsisId` → `espn_id` / `sleeper_id`. Unmapped players are **skipped** (logged); we never fuzzy-match invent ESPN ids.
- **Write:** `PlayerWeekStat` rows with `leagueId = ""`, `source = "nflverse"`. Fills usage columns only.
- **ESPN PPR:** League-scoped rows (`leagueId = <espn league>`) keep owning `projectedPpr` / `actualPpr`. Ingest does not clobber those.
- **Null beats fake:** Red-zone / route % stay `null` until an open feed provides them. No fabricated shares.

**Attribution (UI / docs):** Usage from nflverse (open data, CC-BY).

## How to run

```bash
# Backfill one week
npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --week 3

# Backfill a range
npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --from-week 1 --to-week 4

# Cron (Vercel): GET /api/cron/nflverse-usage
# Authorization: Bearer $CRON_SECRET
# Optional query: ?season=2026&week=3
```

Requires `DATABASE_URL` and (for cron) `CRON_SECRET`.
