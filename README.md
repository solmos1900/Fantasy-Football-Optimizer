# Gridiron IQ

Fantasy football web app for Sebastian: SSO login, ESPN league sync (public + private), live stats, roster/league views, and explainable start/sit insights.

Built with **Next.js App Router**, **TypeScript**, **Tailwind CSS**, **Auth.js (NextAuth v5)**, and **Prisma + PostgreSQL**.

---

## Features

1. **SSO / demo login** — Google and GitHub when configured; always-on Demo login (no OAuth keys required).
2. **ESPN Fantasy integration** — Connect by league ID + season. Private leagues accept `SWID` + `espn_s2` cookies. Connection is persisted per user.
3. **My Team** — Starters/bench with projected vs actual points and injury flags.
4. **Live stats** — NFL scoreboard from ESPN’s public site API (no key). Refresh button + 60s auto-poll.
5. **League overview** — Standings, matchups, and every team’s starters.
6. **Player directory** — Searchable pool with ownership and stats.
7. **Insights** — Rule-based recommendations (start/sit, drop/add, weak positions, matchup mismatch, K/D-ST streaming) with explicit reasoning.

Demo mode seeds a full mock league so the UI is usable without ESPN credentials.

---

## Quick start (local)

```bash
# 1. Install
npm install

# 2. Env
cp .env.example .env
# AUTH_SECRET is required — generate one:
openssl rand -base64 32
# paste into AUTH_SECRET in .env

# 3. Postgres (Docker)
docker compose up -d postgres
# DATABASE_URL in .env.example already matches this compose file

# 4. Migrate
npx prisma migrate deploy
# or during development: npx prisma migrate dev

# 5. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Get started** → **Continue with Demo** → **Load demo league**.

---

## Vercel production checklist (required for demo login)

Live site fails Auth.js with *"There is a problem with the server configuration"* when `AUTH_SECRET` is missing. SQLite also cannot run on Vercel serverless — use Postgres.

In **Vercel → Project → Settings → Environment Variables**, set these for **Production** (and Preview if you use it), then **Redeploy**:

| Variable | Value | Notes |
|----------|-------|-------|
| `AUTH_SECRET` | output of `openssl rand -base64 32` | **Required.** Without it, `/api/auth/*` returns the opaque config error. |
| `AUTH_TRUST_HOST` | `true` | Safe with Vercel reverse proxy (code also sets `trustHost: true`). |
| `AUTH_URL` | `https://gridiron-iq-app-alpha.vercel.app` | Use your real production URL. Avoid leaving this as `http://localhost:3000`. |
| `DATABASE_URL` | `postgresql://…` from Neon or Vercel Postgres | **Required** for demo login (Credentials upserts a user). Prefer the **pooled** Neon URL + `sslmode=require`. |

Optional (SSO only — **not** needed for Demo):

- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`

### Database on Vercel

1. Create a Neon (or Vercel Marketplace Postgres) database.
2. Copy the connection string into `DATABASE_URL` (Production + Preview).
3. Redeploy. The build script runs `prisma migrate deploy` when `DATABASE_URL` is available, so tables are created automatically.

Build command (already in `package.json`):

```bash
prisma generate && prisma migrate deploy && next build
```

**Note:** Vercel builds need `DATABASE_URL` set at build time for migrate to succeed. Add it to Production (and Preview) env, not only Runtime.

After merge + redeploy with the vars above, **Continue with Demo** should work without Google/GitHub OAuth.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres URL (`postgresql://…`) |
| `AUTH_SECRET` | Yes | Random string for Auth.js session encryption |
| `AUTH_TRUST_HOST` | Recommended | Set `true` on Vercel / reverse proxies |
| `AUTH_URL` | Recommended (prod) | Absolute app URL for the deployment |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional | Google OAuth |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | Optional | GitHub OAuth |
| `DEFAULT_ESPN_SEASON` | Optional | Default season year (e.g. `2025`) |
| `NEXT_PUBLIC_APP_NAME` | Optional | Display name |

Copy `.env.example` → `.env`. **Never commit secrets.**

### SSO setup

**Google:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client → redirect  
`http://localhost:3000/api/auth/callback/google` (local) or `{AUTH_URL}/api/auth/callback/google` (prod)

**GitHub:** [Developer settings](https://github.com/settings/developers) → OAuth App → callback  
`http://localhost:3000/api/auth/callback/github` (local) or `{AUTH_URL}/api/auth/callback/github` (prod)

If OAuth vars are empty, only Demo login is shown.

---

## How ESPN auth works (2025–2026)

ESPN does not publish an official Fantasy Football consumer API. The community uses the same JSON endpoints the fantasy.espn.com web app calls:

```
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{leagueId}
  ?view=mTeam&view=mRoster&view=mMatchup&view=mSettings&view=mStandings
```

| League type | What you need |
|-------------|----------------|
| **Public** | League ID + season |
| **Private** | Above + cookies `SWID` and `espn_s2` |

### Copying private-league cookies

1. Log into [fantasy.espn.com](https://fantasy.espn.com) in a browser.
2. DevTools → **Application** → **Cookies** → `https://fantasy.espn.com`.
3. Copy **SWID** (includes braces, e.g. `{ABC-...}`).
4. Copy **espn_s2** (long value — keep encoding as shown).
5. Paste both into **Connect league** in this app.

Cookies are stored on your user row in Postgres (`LeagueConnection`) and sent only to ESPN’s fantasy API. Treat them like passwords; they expire when ESPN invalidates the session.

### Live NFL scores

Free, no-key endpoint:

```
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
```

---

## Architecture

```
src/lib/auth.ts              Auth.js providers + JWT session
src/lib/espn/client.ts       ESPN Fantasy + scoreboard fetch/normalize
src/lib/stats/provider.ts    Live stats (ESPN public or demo fallback)
src/lib/insights/engine.ts   Explainable recommendation heuristics
src/lib/league/service.ts    Persist/connect/sync per user
src/lib/demo/seed.ts         Mock league for demo mode
```

Pages: `/dashboard`, `/team`, `/league`, `/players`, `/insights`, `/connect`.

---

## Feature walkthrough

1. **Login** with Demo (or Google/GitHub).
2. **Connect** → Load demo league *or* enter ESPN League ID (+ cookies if private).
3. **Home** — team snapshot, top insights, live scoreboard with Refresh.
4. **My Team** — starters vs bench, proj/actual, injury badges.
5. **League** — standings, matchups, roster strips.
6. **Players** — search/filter owned + free agents.
7. **Insights** — prioritized recommendations with bullet-point reasoning.
8. **Sync now** — re-fetch ESPN (or re-seed demo).

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | `prisma generate` + `migrate deploy` + `next build` |
| `npm run start` | Run production server |
| `npm run lint` | ESLint |
| `npm run db:up` | Start local Postgres via Docker Compose |
| `npm run db:down` | Stop local Postgres |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:deploy` | Prisma migrate deploy (prod/CI) |
| `npm run db:push` | Push Prisma schema (no migration history) |
| `npm run db:studio` | Prisma Studio |

---

## Notes / limits (v1 MVP)

- Insights are explicit heuristics, not ML.
- ESPN unofficial APIs can change; sync errors surface in the Connect form.
- Demo NFL team abbreviations in ESPN-synced rosters may show as `T{id}` until a pro-team map is expanded.
- Postgres is required for local and Vercel (SQLite is not supported on serverless).
