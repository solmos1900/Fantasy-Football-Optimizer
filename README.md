# Gridiron IQ

Fantasy football web app for Sebastian: SSO login, ESPN league sync (public + private), live stats, roster/league views, and explainable start/sit insights.

Built with **Next.js App Router**, **TypeScript**, **Tailwind CSS**, **Auth.js (NextAuth v5)**, and **Prisma + SQLite**.

---

## Features

1. **SSO / demo login** — Google and GitHub when configured; always-on Demo login for local use.
2. **ESPN Fantasy integration** — Connect by league ID + season. Private leagues accept `SWID` + `espn_s2` cookies. Connection is persisted per user.
3. **My Team** — Starters/bench with projected vs actual points and injury flags.
4. **Live stats** — NFL scoreboard from ESPN’s public site API (no key). Refresh button + 60s auto-poll.
5. **League overview** — Standings, matchups, and every team’s starters.
6. **Player directory** — Searchable pool with ownership and stats.
7. **Insights** — Rule-based recommendations (start/sit, drop/add, weak positions, matchup mismatch, K/D-ST streaming) with explicit reasoning.

Demo mode seeds a full mock league so the UI is usable without ESPN credentials.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Env
cp .env.example .env
# AUTH_SECRET is required — generate one:
# openssl rand -base64 32

# 3. Database
npx prisma migrate dev --name init
# or: npx prisma db push

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Get started** → **Continue with Demo** → **Load demo league**.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path, e.g. `file:./dev.db` |
| `AUTH_SECRET` | Yes | Random string for Auth.js session encryption |
| `AUTH_TRUST_HOST` | Recommended | Set `true` for local / reverse-proxy |
| `AUTH_URL` | Optional | Absolute app URL (some deploys) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional | Google OAuth |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | Optional | GitHub OAuth |
| `DEFAULT_ESPN_SEASON` | Optional | Default season year (e.g. `2025`) |
| `NEXT_PUBLIC_APP_NAME` | Optional | Display name |

Copy `.env.example` → `.env`. **Never commit secrets.**

### SSO setup

**Google:** [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client → redirect  
`http://localhost:3000/api/auth/callback/google`

**GitHub:** [Developer settings](https://github.com/settings/developers) → OAuth App → callback  
`http://localhost:3000/api/auth/callback/github`

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

Cookies are stored on your user row in SQLite (`LeagueConnection`) and sent only to ESPN’s fantasy API. Treat them like passwords; they expire when ESPN invalidates the session.

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
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint |
| `npm run db:push` | Push Prisma schema |
| `npm run db:studio` | Prisma Studio |

---

## Notes / limits (v1 MVP)

- Insights are explicit heuristics, not ML.
- ESPN unofficial APIs can change; sync errors surface in the Connect form.
- Demo NFL team abbreviations in ESPN-synced rosters may show as `T{id}` until a pro-team map is expanded.
- SQLite is for local/dev; swap `DATABASE_URL` to Postgres for production if needed.
