# nflverse usage ingest

League-agnostic weekly **usage** (targets, carries, shares, snaps) lands in `PlayerWeekStat` with `leagueId = ""` and `source = "nflverse"`. ESPN sync still owns league-scoped `projectedPpr` / `actualPpr`.

See [DATA_SOURCES.md](../DATA_SOURCES.md) for CC-BY attribution and hard “no invented stats” rules.

## ID crosswalk

| Field | Source |
|-------|--------|
| `Player.espnId` | Existing primary key |
| `Player.gsisId` | nflverse `player_id` / `gsis_id` |
| `Player.sleeperId` | DynastyProcess / ffverse `db_playerids` when present |

Join: weekly `player_id` → crosswalk → upsert `Player` → upsert `PlayerWeekStat(espnId, season, week, leagueId="")`.

Unmapped GSIS ids are skipped and counted — never invented.

## Cron

- Route: `GET /api/cron/nflverse-usage`
- Auth: `Authorization: Bearer $CRON_SECRET` (same pattern as cleanup)
- Schedule: `vercel.json` — Tue/Wed 15:00 UTC (≈ 08:00 PT) after MNF
- One season/week per invocation (`maxDuration = 300`)
- Default week = latest REG week in the nflverse season file; override with `?season=&week=`

## CLI backfill

```bash
npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --week 3
npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --from-week 1 --to-week 4
```

## Code map

| Path | Role |
|------|------|
| `src/lib/nflverse/*` | Fetch, crosswalk, mapper, batch upsert |
| `src/app/api/cron/nflverse-usage` | Gated cron entry |
| `scripts/ingest-nflverse-usage.ts` | Local / CI backfill |
| `scripts/verify-nflverse-usage.ts` | Mapper + wiring guards (no DB) |
