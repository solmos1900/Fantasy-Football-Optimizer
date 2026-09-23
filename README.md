# Gridiron IQ

Fantasy football web app: Google / GitHub / email-password / guest login, ESPN league sync (public + private), live stats, roster/league views, and explainable PPR insights (start/sit, mutual trades, news, defense history).

Built with **Next.js App Router**, **TypeScript**, **Tailwind CSS**, **Auth.js (NextAuth v5)**, and **Prisma + PostgreSQL**.

---

## Features

1. **Authentication** — Google and GitHub OAuth when configured; email/password (bcrypt) registration + sign-in; **Guest** mode for try-without-account. Demo-only login is removed.
2. **ESPN Fantasy integration** — Connect by league ID + season once; the connection is saved on that user (guest or signed-in). Later visits use **Sync** to refresh — you do not re-enter the League ID every session. Private leagues accept `SWID` + `espn_s2` cookies (also stored). Guest and signed-in accounts do **not** share leagues.
3. **My Team** — Starters/bench with projected vs actual points and injury flags. Player rows open a drill-down (recent PPR, defense comps, start/sit lean).
4. **Live stats** — NFL scoreboard from ESPN’s public site API (no key). Refresh button + 60s auto-poll.
5. **League overview** — Standings, matchups, and every team’s roster (full league visibility for trades).
6. **Player directory** — Searchable pool with ownership and stats.
7. **Insights (product core)** — Rule-based, explainable recommendations:
   - **Start / Sit** with START vs SIT verdicts (projection, recent form, injury, defense history)
   - **Mutual trades** with other teams (why it helps both sides)
   - **Waiver Wire Shark** — injury → opportunity claims (handcuffs / next-man-up) filtered to your league’s free agents
   - **Injury / news** cards from ESPN public feeds (never invented)
   - **Matchup notes** — how similar-role players fared vs that defense recently
   - Drop/add, weak positions, streaming as supporting signals
8. **Trade Analyzer** — Interactive give/get builder against any league mate; instant verdict (Accept → Hard reject), chip totals + value gap, hard-reject reasons, For you / For them, and partner acceptance lean as a Low/Medium/High band (not a fake %). Same 1QB full-PPR chip math + trend nudges as Insights suggestions. Works with demo or ESPN-synced leagues.

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
| `DEFAULT_ESPN_SEASON` | Optional | Default season year (e.g. `2026`) |
| `NEXT_PUBLIC_DEFAULT_SEASON` | Optional | Client form default; keep in sync with `DEFAULT_ESPN_SEASON` |
| `NEXT_PUBLIC_APP_NAME` | Optional | Display name |

Copy `.env.example` → `.env`. **Never commit secrets.**

---

## Insights data sources

| Signal | Source |
|--------|--------|
| Projections / actuals / rosters | ESPN Fantasy unofficial API (synced + cached per user) or demo seed |
| Weekly proj vs actual history | Neon `PlayerProjectionSnapshot` + `PlayerTrendMetric` (filled on sync / Insights / `POST /api/trends/refresh`) |
| Prior-week form | ESPN player weekly `stats` (actual + projected when present); demo seed includes `recentWeeks` |
| Defense vs similar players | League-wide `recentWeeks` vs opponent + seeded defense history table |
| Injury / news | ESPN public site news + injuries APIs; roster injury flags as fallback — **never invented** |
| Trades | `src/lib/insights/trade-value.ts` + `trades.ts` — full-PPR 1QB norms + stored trend chip nudges |
| Trade Analyzer | `src/lib/insights/trade-analyzer.ts` — grades user-built packages with the same chip / need helpers |
| Waiver Wire Shark | `src/lib/insights/waivers.ts` — injury → FA opportunity mapping |

Engine: `src/lib/insights/engine.ts` + `trade-value.ts` + `trades.ts` + `trade-analyzer.ts` + `waivers.ts` + `defense-matchups.ts` + `trends.ts`. No paid LLM dependency.

See **[docs/projections-and-trends.md](docs/projections-and-trends.md)** for schema, refresh path, and how to read trend labels.

### Waiver Wire Shark (injury → opportunity)

Situational claims, not generic “highest projected FA” lists:

1. **Injury signal only** — roster `OUT` / `DOUBTFUL` / `IR`, plus ESPN news that clearly marks a player out. Never invent injuries.
2. **Beneficiary mapping** — prefer curated same-team handcuffs/backups (e.g. Puka → Tutu Atwell; Kyren → Blake Corum; Tua → Jameis Winston); else same-NFL-team FAs at the same position (depth next-up), labeled as uncertain when inferred.
3. **League FA cross-check** — only recommend players actually on your waiver wire (not rostered).
4. **Drop hint** — if the roster looks full, suggest a weak/injured bench drop candidate.
5. Works for guest/demo leagues and connected ESPN leagues.

### Trade recommendation rules (1QB full PPR)

Encoded from common r/fantasyfootball / Trade Analyzer norms — not raw projection swaps:

**Hard rejects**
- No 1-for-1 QB ↔ WR/RB/TE (streaming QBs are deep; elite skill is scarce).
- No tier gaps of 2+ on 1:1s; no chip-value ratio above ~1.55 (QBs heavily discounted).

**Preferred**
- Same-position or skill↔skill surplus→need fills.
- 2-for-1 / 1-for-2 when values are uneven.
- QB only as a package sweetener (QB + skill ↔ elite skill) when the partner needs QB.
- Each card includes “why this gets accepted” plus **trend/projection rationale** when Neon snapshots exist (buy-low on bust/cold, sell-high on boom/hot).

**Valuation**
- Chip blend: ~70% ROS/recent form + ~30% this-week projection, plus `restOfSeasonAdj` from stored proj-vs-actual trends; scarcity TE/RB1 > WR1 > QB.
- Assumes **full PPR** product default; ESPN `appliedTotal` already reflects connected league scoring when synced.

### Trade Analyzer (interactive)

Page: `/trades` (also linked from Insights → Trade ideas).

1. Pick a partner team from the league.
2. Select players to **Give** (your roster) and **Get** (theirs).
3. Instant analysis card:
   - Verdict: Accept / Lean accept / Fair / Lean reject / Hard reject (plain language)
   - Side chip totals + value gap (shared `chipValue` from `trade-value.ts`, including trend nudges when available)
   - Hard-reject reasons when applicable
   - For you / For them / why accepted or not (need-fit)
   - Partner acceptance lean as **Low / Medium / High** (or None if blocked) — not a calibrated %
4. Deep-link from an Insights suggestion: `/trades?partner=<teamId>&give=<ids>&get=<ids>`
5. Default scoring: full PPR / 1QB redraft. Dynasty, draft picks, and half-PPR toggles are out of scope for v1.

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
src/lib/insights/engine.ts         Start/sit, news, matchup notes, other
src/lib/insights/trade-value.ts    Shared 1QB full-PPR chip / need / hard-reject helpers
src/lib/insights/trades.ts         Auto mutual trade suggestions (uses trade-value)
src/lib/insights/trade-analyzer.ts Interactive package grading (uses trade-value)
src/lib/insights/waivers.ts        Injury → waiver opportunity (Shark)
src/lib/insights/player-detail.ts  Per-player start/sit + defense comps + trends
src/lib/insights/defense-matchups.ts Similar-player vs defense history
src/lib/insights/trends.ts         Projection snapshots + trend metrics (Neon)
src/lib/insights/trend-labels.ts   Shared trend label copy
src/app/api/trends/refresh/route.ts On-demand trend refresh / read
src/components/trend-panel.tsx     Proj vs actual spark + table
src/components/trade-analyzer.tsx  Client UI for give/get + analysis card
src/lib/league/service.ts          Persist/connect/sync per user (+ trend refresh)
src/lib/demo/seed.ts               Mock league for guest / demo connect
```

Pages: `/dashboard`, `/team`, `/league`, `/players`, `/insights`, `/trades`, `/connect`, `/login`.

---

## Feature walkthrough

1. **Login** with Google, GitHub, email/password, or **Guest**.
2. **Connect** → Load demo *or* enter ESPN League ID once (+ cookies if private). Saved on your account.
3. **Home** — team snapshot, top insights, live scoreboard with Refresh + **Sync**.
4. **My Team** — starters vs bench, proj/actual, injury badges.
5. **League** — standings, matchups, every roster + **Sync** (no re-entry of League ID).
6. **Players** — search/filter owned + free agents.
7. **Insights** — Start/Sit, Trades (PPR norms), Waiver Wire Shark, News, Matchup notes, and supporting signals.
8. **Trades** — Interactive Trade Analyzer (give/get builder + instant grade); deep-links from Insights suggestions.
9. **Sync** (Home / League / Connect) — re-fetch ESPN or re-seed demo from the saved connection.

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
