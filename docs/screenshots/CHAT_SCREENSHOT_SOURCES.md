# Chat screenshot number sources (Week 7, 2026)

Generated: 2026-10-23T21:04:24.238Z

All card numbers come from the shared chat tool runners (`runTradeCompare` / `runWhoToStartCompare` → `buildPlayerMetricCard`). No fixture invents PPG, opponent, or trend text.

## Upstream feeds

| What | URL / asset |
| --- | --- |
| Sleeper full-PPR projections | `https://api.sleeper.app/projections/nfl/2026/7?season_type=regular` |
| nflverse week PPR | `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv.gz` (`fantasy_points_ppr`) |
| ESPN week schedule (@/vs) | `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=7` |

## Per-player card fields

### Puka Nacua (LAR)

- **Opponent (this week):** `@LV` — ESPN NFL scoreboard season 2026 week 7 → formatOpponentLabel
- **Points per game this season:** `23.0` — mean of nflverse `fantasy_points_ppr` weeks: W1=12.4, W4=27.7, W5=37.7, W6=14
- **Avg last 3 games:** `26.5` — mean of latest 3 scored weeks: W6=14, W5=37.7, W4=27.7
- **Projected points this week:** `22.3` — Sleeper GET /projections/nfl/2026/7?season_type=regular · stats.pts_ppr · name|team puka nacua|LAR
- **Trend line:** `Last 3 games avg 26.5 vs season 23.0: trending up` — formImpactLine(player) from this player's recentWeeks only

### Kyren Williams (LAR)

- **Opponent (this week):** `@LV` — ESPN NFL scoreboard season 2026 week 7 → formatOpponentLabel
- **Points per game this season:** `19.8` — mean of nflverse `fantasy_points_ppr` weeks: W1=15.5, W2=15.7, W3=21.8, W4=36.7, W5=19.6, W6=9.7
- **Avg last 3 games:** `22.0` — mean of latest 3 scored weeks: W6=9.7, W5=19.6, W4=36.7
- **Projected points this week:** `19.8` — Sleeper GET /projections/nfl/2026/7?season_type=regular · stats.pts_ppr · name|team kyren williams|LAR
- **Trend line:** `Last 3 games avg 22.0 vs season 19.8: holding steady` — formImpactLine(player) from this player's recentWeeks only

### Ja'Marr Chase (CIN)

- **Opponent (this week):** `@BAL` — ESPN NFL scoreboard season 2026 week 7 → formatOpponentLabel
- **Points per game this season:** `16.0` — mean of nflverse `fantasy_points_ppr` weeks: W1=3.2, W2=26.5, W3=24.8, W4=5.7, W5=19.7
- **Avg last 3 games:** `16.7` — mean of latest 3 scored weeks: W5=19.7, W4=5.7, W3=24.8
- **Projected points this week:** `18.8` — Sleeper GET /projections/nfl/2026/7?season_type=regular · stats.pts_ppr · name|team ja'marr chase|CIN
- **Trend line:** `Last 3 games avg 16.7 vs season 16.0: holding steady` — formImpactLine(player) from this player's recentWeeks only

### Chase Brown (CIN)

- **Opponent (this week):** `@BAL` — ESPN NFL scoreboard season 2026 week 7 → formatOpponentLabel
- **Points per game this season:** `13.0` — mean of nflverse `fantasy_points_ppr` weeks: W1=18.8, W2=11.2, W3=8.9, W4=19.1, W5=7
- **Avg last 3 games:** `11.7` — mean of latest 3 scored weeks: W5=7, W4=19.1, W3=8.9
- **Projected points this week:** `14.8` — Sleeper GET /projections/nfl/2026/7?season_type=regular · stats.pts_ppr · name|team chase brown|CIN
- **Trend line:** `Last 3 games avg 11.7 vs season 13.0: holding steady` — formImpactLine(player) from this player's recentWeeks only

### Amon-Ra St. Brown (DET)

- **Opponent (this week):** `vs GB` — ESPN NFL scoreboard season 2026 week 7 → formatOpponentLabel
- **Points per game this season:** `20.8` — mean of nflverse `fantasy_points_ppr` weeks: W1=28.7, W2=35.2, W3=11.9, W4=15.5, W5=12.9
- **Avg last 3 games:** `13.4` — mean of latest 3 scored weeks: W5=12.9, W4=15.5, W3=11.9
- **Projected points this week:** `19.5` — Sleeper GET /projections/nfl/2026/7?season_type=regular · stats.pts_ppr · name|team amon-ra st. brown|DET
- **Trend line:** `Last 3 games avg 13.4 vs season 20.8: trending down` — formImpactLine(player) from this player's recentWeeks only

### DK Metcalf (PIT)

- **Opponent (this week):** `@NO` — ESPN NFL scoreboard season 2026 week 7 → formatOpponentLabel
- **Points per game this season:** `11.5` — mean of nflverse `fantasy_points_ppr` weeks: W1=8, W2=6.7, W3=12.1, W4=16.5, W5=5.3, W6=20.3
- **Avg last 3 games:** `14.0` — mean of latest 3 scored weeks: W6=20.3, W5=5.3, W4=16.5
- **Projected points this week:** `12.4` — Sleeper GET /projections/nfl/2026/7?season_type=regular · stats.pts_ppr · name|team dk metcalf|PIT
- **Trend line:** `Last 3 games avg 14.0 vs season 11.5: trending up` — formImpactLine(player) from this player's recentWeeks only

## Trade verdict

- **Value basis:** season points per game (sum). Not `chipValue` blend.
- Left package value: **42.8** · Right: **29.0**
- Per-player trade values: Puka Nacua (LAR)=23.0, Kyren Williams (LAR)=19.8, Ja'Marr Chase (CIN)=16.0, Chase Brown (CIN)=13.0
- Gap: **-13.8** · relative **47.6%** vs **lower side** → tier **lopsided** · tone **caution**
- Headline: Lopsided: Left gets 13.8 more points of value (48%); Right shouldn't accept.
- Freshness: `Stats through Week 6 · updated just now` (stats through Week 6)

## Who to Start

- Headline: Start Amon-Ra St. Brown (DET) over DK Metcalf (PIT)
- Edge: 7.1
