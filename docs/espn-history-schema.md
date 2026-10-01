# ESPN multi-season history schema

Additive `Espn*` tables store queryable multi-season league facts (teams, matchups, roster slots, drafts, transactions, champions, all-time member records). They hang off a stable `EspnLeague.espnLeagueId`.

**Cookies stay on `LeagueConnection` only** (`espnSwid` / `espnS2`). History tables never store session cookies.

**`cachedPayload`** remains the current-season app snapshot for fast UI. Normalized `Espn*` rows are for multi-season SQL and Insights (sync writers land in a follow-up PR — out of scope for schema-only).

Optional nullable `LeagueConnection.espnLeagueId` can link a connection to `EspnLeague` without requiring existing rows to have history yet.

Migration: `20261001000000_espn_history_models`.
