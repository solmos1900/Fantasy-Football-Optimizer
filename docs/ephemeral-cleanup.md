# Ephemeral storage cleanup

## Function Storage vs Neon

Sebastian’s Vercel email about **Function Storage (10 GB)** refers to **retained Vercel Function bundles** tied to deployments ([Deployment Storage](https://vercel.com/docs/deployment-storage)). That meter is **not** Neon Postgres.

| Meter | What grows it | How to shrink |
|-------|---------------|---------------|
| **Functions Storage** (Vercel) | Old production/preview deployments kept on the team | Shorten **Deployment Retention** in the Vercel project/team settings; delete unused deployments |
| **Neon / `DATABASE_URL`** | Guest `User` rows, per-guest `LeagueConnection` JSON, Auth leftovers | Guest wipe on sign-out + daily cron (this repo) |

Guest cleanup below targets **Postgres**. It does not lower the Function Storage gauge by itself.

## What we clean (Postgres)

1. **On Sign out** — `POST /api/guest/end-session` deletes the current guest `User` (cascade: `LeagueConnection`, Auth `Account`/`Session`). Real accounts are untouched.
2. **Auth.js `signOut` event** — backup wipe when the JWT carries `isGuest`.
3. **Daily cron** — `GET /api/cron/cleanup` (see `vercel.json`, `0 8 * * *` UTC):
   - Guest users older than `GUEST_SESSION_TTL_HOURS` (default **24**)
   - Expired `Session` rows
   - Expired `VerificationToken` rows
   - `LeagueConnection.cachedPayload` larger than ~750k chars (row kept, blob nulled)
   - Orphan `PlayerWeekStat` / `PlayerTrendSnapshot` for leagueIds with no remaining connection
   - Historical `source: "demo"` week stats / `demo-league` trend rows (no longer written)

## What we stop writing

- Fabricated in-memory seed (`leagueId` `demo-league`) never persists `PlayerWeekStat` / `PlayerTrendSnapshot`.
- Guest **Load demo league** uses a real ESPN snapshot from `DEMO_LEAGUE_CONNECTION_ID` (read-only). Guest rows store a sanitized `cachedPayload` and **never** copy `espnSwid` / `espnS2`. Shared source refresh uses a TTL (`DEMO_LEAGUE_SYNC_TTL_MINUTES`, default 12).

Live ESPN sync for **signed-in** users is unchanged.

## Configure on Vercel

1. Set `CRON_SECRET` (`openssl rand -base64 32`) on Production (and Preview if you want to test).
2. Optional: `GUEST_SESSION_TTL_HOURS=24`.
3. Redeploy so `vercel.json` registers the cron.
4. Confirm under Project → **Settings → Cron Jobs**, or `vercel crons ls`.

Manual test (prod URL):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_APP/api/cron/cleanup
```
