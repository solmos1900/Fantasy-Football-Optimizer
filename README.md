# Gridiron IQ

Fantasy football web app: Google / GitHub / email-password / guest login, ESPN league sync (public + private), live stats, roster/league views, and explainable PPR insights (start/sit, mutual trades, news, defense history).

Built with **Next.js App Router**, **TypeScript**, **Tailwind CSS**, **Auth.js (NextAuth v5)**, and **Prisma + PostgreSQL**.

---

## Features

1. **Authentication** — Google and GitHub OAuth when configured; email/password (bcrypt) registration + sign-in; **Guest** mode for try-without-account. Demo-only login is removed.
2. **ESPN Fantasy integration** — Connect by league ID + season. Private leagues accept `SWID` + `espn_s2` cookies. Connection is persisted per user.
3. **My Team** — Starters/bench with projected vs actual points and injury flags.
4. **Live stats** — NFL scoreboard from ESPN’s public site API (no key). Refresh button + 60s auto-poll.
5. **League overview** — Standings, matchups, and every team’s roster (full league visibility for trades).
6. **Player directory** — Searchable pool with ownership and stats.
7. **Insights (product core)** — Rule-based, explainable recommendations:
   - **Start / Sit** with START vs SIT verdicts (projection, recent form, injury, defense history)
   - **Mutual trades** with other teams (why it helps both sides)
   - **Injury / news** cards from ESPN public feeds (never invented)
   - **Matchup notes** — how similar-role players fared vs that defense recently
   - Drop/add, weak positions, streaming as supporting signals

Guest and email/password work **without** OAuth secrets. Demo-seeded league still loads from Connect for guests.

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

Open [http://localhost:3000](http://localhost:3000) → **Get started** → sign in with email, **Continue as Guest**, or OAuth → **Load demo league** (or connect ESPN).

---

## Vercel production checklist

Live Auth.js fails with *"There is a problem with the server configuration"* when `AUTH_SECRET` is missing. Postgres is required (no SQLite on Vercel serverless).

In **Vercel → Project → Settings → Environment Variables**, set these for **Production** (and Preview if you use it), then **Redeploy**:

| Variable | Value | Notes |
|----------|-------|-------|
| `AUTH_SECRET` | output of `openssl rand -base64 32` | **Required.** Without it, `/api/auth/*` returns the opaque config error. |
| `AUTH_TRUST_HOST` | `true` | Safe with Vercel reverse proxy (code also sets `trustHost: true`). |
| `AUTH_URL` | `https://gridiron-iq-app-alpha.vercel.app` | Use your real production URL. Avoid leaving this as `http://localhost:3000`. |
| `DATABASE_URL` | `postgresql://…` from Neon or Vercel Postgres | **Required** for all auth modes (Credentials / Guest upsert users). Prefer the **pooled** Neon URL + `sslmode=require`. |

### Optional — Google / GitHub OAuth (not required for email or Guest)

Set **either** Auth.js names **or** common aliases:

| Provider | Preferred | Also accepted |
|----------|-----------|-----------------|
| Google | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| GitHub | `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | `GITHUB_ID` / `GITHUB_SECRET` |

**Redirect URIs to register with the providers:**

- Google: `{AUTH_URL}/api/auth/callback/google`
- GitHub: `{AUTH_URL}/api/auth/callback/github`

If OAuth vars are empty, the sign-in page still shows Google/GitHub as disabled/hidden with a short note; **email/password and Guest remain available**.

### Database on Vercel

1. Create a Neon (or Vercel Marketplace Postgres) database.
2. Copy the connection string into `DATABASE_URL` (Production + Preview).
3. Redeploy. The build script runs `prisma migrate deploy` when `DATABASE_URL` is available.

Build command (already in `package.json`):

```bash
prisma generate && prisma migrate deploy && next build
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres URL (`postgresql://…`) |
| `AUTH_SECRET` | Yes | Random string for Auth.js session encryption |
| `AUTH_TRUST_HOST` | Recommended | Set `true` on Vercel / reverse proxies |
| `AUTH_URL` | Recommended (prod) | Absolute app URL for the deployment |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional | Google OAuth (or `GOOGLE_CLIENT_*`) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | Optional | GitHub OAuth (or `GITHUB_ID` / `GITHUB_SECRET`) |
| `DEFAULT_ESPN_SEASON` | Optional | Default season year (e.g. `2025`) |
| `NEXT_PUBLIC_APP_NAME` | Optional | Display name |

Copy `.env.example` → `.env`. **Never commit secrets.**

---

## Insights data sources

| Signal | Source |
|--------|--------|
| Projections / actuals / rosters | ESPN Fantasy unofficial API (synced + cached per user) or demo seed |
| Prior-week form | ESPN player weekly `stats` when present; demo seed includes `recentWeeks` |
| Defense vs similar players | League-wide `recentWeeks` vs opponent + seeded defense history table |
| Injury / news | ESPN public site news + injuries APIs; roster injury flags as fallback — **never invented** |
| Trades | Rule engine over all league rosters (positional surplus/need, projection parity) |

Engine: `src/lib/insights/engine.ts` + `src/lib/insights/defense-matchups.ts`. No paid LLM dependency.

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

Cookies are stored on your user row in Postgres and sent only to ESPN’s fantasy API. Treat them like passwords.

### Live NFL scores

```
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
```

---

## Architecture

```
src/lib/auth.ts                    Auth.js providers (Google, GitHub, credentials, guest) + JWT
src/lib/password.ts                bcrypt helpers for email/password
src/app/api/auth/register/route.ts Email registration
src/lib/espn/client.ts             ESPN Fantasy + scoreboard + recent weekly stats
src/lib/espn/news.ts               ESPN public news / injuries
src/lib/stats/provider.ts          Live stats (ESPN public or demo fallback)
src/lib/insights/engine.ts         Start/sit, trades, other heuristics
src/lib/insights/defense-matchups.ts Similar-player vs defense history
src/lib/league/service.ts          Persist/connect/sync per user
src/lib/demo/seed.ts               Mock league for guest / demo connect
```

Pages: `/dashboard`, `/team`, `/league`, `/players`, `/insights`, `/connect`, `/login`.

---

## Feature walkthrough

1. **Login** with Google, GitHub, email/password, or **Guest**.
2. **Connect** → Load demo league *or* enter ESPN League ID (+ cookies if private).
3. **Home** — team snapshot, top insights, live scoreboard with Refresh.
4. **My Team** — starters vs bench, proj/actual, injury badges.
5. **League** — standings, matchups, every roster.
6. **Players** — search/filter owned + free agents.
7. **Insights** — Start/Sit, Trades, News, Matchup notes, and supporting signals.
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

## Notes / limits (v1)

- Insights are explicit heuristics, not ML.
- ESPN unofficial APIs can change; sync errors surface in the Connect form.
- Demo NFL team abbreviations in ESPN-synced rosters may show as `T{id}` until a pro-team map is expanded.
- Postgres is required for local and Vercel.
