# Gridiron IQ

A fantasy football helper you can install like an app on your phone. Connect your ESPN fantasy league (or try the labeled demo as a guest). See projected vs actual points, and get start/sit, waiver, matchup, and trade advice with reasons you can read — not a black box.

Add it to your Home Screen on iPhone (Safari → Share → Add to Home Screen) for a full-screen shortcut.

**Live:** [fantasyfootballoptimizer-kappa.vercel.app](https://fantasyfootballoptimizer-kappa.vercel.app)  
**Stack:** Next.js App Router, TypeScript, Tailwind CSS, Auth.js (NextAuth v5), Prisma + PostgreSQL (Neon on Vercel).

UI lock: Retro Draft Board + Helmet Orbit icon on solid dark charcoal (`#1c1c1c`).

---

## What it is

Gridiron IQ helps managers in **full-PPR** ESPN fantasy leagues make weekly decisions. **Full PPR** means receptions count as a full point. It does not replace ESPN as your league host. It syncs your league (or loads a demo), saves that snapshot on your account or guest session, and shows advice in plain English.

This app assumes **1QB redraft**: a season-long league where you start one quarterback and the league resets every year (no dynasty or keepers).

| Path | Who it’s for |
|------|----------------|
| **Guest** | Try the product with only a display name. No email required. Guest data does not carry over if you later sign in with Google, GitHub, or email. |
| **Signed in** | Google, GitHub, or email/password. League connections stay on that account. |

After you enter, you pick how to get data: **Load demo league** or **Connect ESPN**. Those are equal choices — neither sits under the other. In demo mode, your display name becomes your team name.

---

## Feature set

- **My Team** — Your starters and bench with projected vs actual points and injury flags. Tap a row for a player detail page.
- **Insights** — Weekly callouts: who to start or sit, free-agent pickups, news, roster gaps, and matchup notes. Trend cards show how projections compared to real scores over finished weeks.
- **Player detail** — This week’s matchup, recent scoring, and similar players vs this defense — taken only from real finished games in your synced league (or the labeled demo). If there isn’t enough history, you get an empty state — never made-up weeks or points.
- **Trades** — Two tools on one page:
  - **Trade analyzer** — A 3-step give/get grader vs a league mate (who you trade with, what you send, what you get). See [How trade grades work](#how-trade-grades-work) below.
  - **Who to Start** — Pick two players at the same position (search by name; you don’t pick a team first). Get a START A / START B call (or a lean / toss-up) with short reasons from projection, recent form, injury, and defense matchup. Same honesty rules as Insights.
- **League / Players** — Standings, matchups, full rosters, and a searchable player pool.
- **Sync vs Connect** — **Connect** saves your league ID (and private cookies if needed) once on this account. **Sync** refreshes from that saved connection without typing the ID again.
- **Live scoreboard** — NFL games from ESPN’s public scoreboard API (no API key).

---

## Where data comes from

| What you see | Where it comes from |
|--------------|---------------------|
| Rosters, projections, actuals, matchups | ESPN Fantasy league APIs (the unofficial endpoints the fantasy.espn.com site uses), synced and cached for your account |
| Opponent labels for finished weeks | ESPN’s public NFL scoreboard |
| Guest demo | In-app **labeled demo** seed (weeks limited to finished ones). Demo comps are tagged Demo |
| News / injuries | ESPN public news feeds + roster injury flags — never invented |
| Trends (projected vs actual) | Saved in Postgres when you sync or open Insights, for that league connection |

**Honesty rules**

- Defense / similar-player comps use **finished weeks only** (never the current or future week).
- No made-up named-player week or point comps for live leagues.
- When the sample is thin, the UI says so and shows an empty state.
- Prior-season lines include the year so they are not mixed up with this season.

---

## How trade grades work

When you build a trade on the Trades page, Gridiron IQ scores both sides and tells you whether the deal looks good for you.

**Chip value** is the app’s internal score for “how valuable is this player right now for trading.” It is not ESPN points and not auction dollars. It is built from this week’s projection, how they have been scoring lately, rest-of-season trend when we have one, and injury status.

The Trade Analyzer and Insights trade ideas use the same **1QB full-PPR** chip model.

It looks at:

- How many points each player is projected to score this week
- How those players have actually been scoring in recent weeks (only after enough games have been played)
- Whether your roster is weak or strong at that position (for example, you already have three good RBs vs you have nobody at TE)
- Hard “don’t do this” rules for a normal one-QB league — for example, trading your only good quarterback straight-up for a skill player is blocked as a bad idea

You get:

- A clear verdict in English: Accept, Lean accept, Fair, Lean reject, or Hard reject
- Totals for each side of the trade, and the gap between them (how much more value one side is getting on the chip scale)
- Short notes that say who comes out ahead and who is giving up more
- A Low / Medium / High read on whether the other manager might say yes — or none if the deal is blocked. This is a rough judgment band, not a made-up percentage

The grading is rule-based TypeScript, not an AI chatbot. Exact formula constants stay private.

---

## Trust / honesty

- Comps never invent a player, week, or point total.
- Demo data is always labeled as demo.
- Guest mode is temporary browse/try — connect ESPN on a real account when you want a lasting league link.
- Live ESPN leagues never fall back to demo top-performer names or points.

---

## PWA install (iOS Safari)

1. Open the site in **Safari** (Home Screen install requires Safari on iPhone/iPad).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch **Gridiron IQ** from the Home Screen for a full-screen shortcut.

Android Chrome: browser menu → Install app / Add to Home screen.

---

## Run locally

```bash
npm install
cp .env.example .env
# Set AUTH_SECRET — generate with: openssl rand -base64 32
docker compose up -d postgres   # matches DATABASE_URL in .env.example
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Continue as Guest** (display name only) or **Get started** → **Load demo league** or connect ESPN.

### Environment variables (high level)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres URL |
| `AUTH_SECRET` | Yes | Auth.js session encryption |
| `AUTH_TRUST_HOST` | Recommended on Vercel | `true` behind the proxy |
| `AUTH_URL` | Recommended in prod | Absolute app URL (your Vercel domain) |
| `AUTH_GOOGLE_*` / `AUTH_GITHUB_*` | Optional | OAuth (email + Guest work without them) |
| `DEFAULT_ESPN_SEASON` / `NEXT_PUBLIC_DEFAULT_SEASON` | Optional | Season year defaults |
| `ESPN_COOKIE_ENCRYPTION_KEY` | Required in prod for private leagues | AES-256-GCM key for SWID / espn_s2 at rest (`openssl rand -base64 32`) |
| `CRON_SECRET` | Required for cron cleanup | Bearer token for `GET /api/cron/cleanup` (Vercel Cron sends it automatically when set) |
| `GUEST_SESSION_TTL_HOURS` | Optional (default `24`) | Abandoned guest users + their league rows are deleted after this TTL |

Private ESPN leagues need `SWID` + `espn_s2` cookies from fantasy.espn.com while logged in — paste them in Connect. Treat cookies like passwords; they are **encrypted at rest** (AES-256-GCM) on `LeagueConnection`. See `.env.example`. **Never commit secrets.**

### Vercel

Production needs `AUTH_SECRET`, `DATABASE_URL` (pooled Neon URL preferred), and usually `AUTH_URL` + `AUTH_TRUST_HOST=true`. Set `ESPN_COOKIE_ENCRYPTION_KEY` before connecting private ESPN leagues. Set `CRON_SECRET` so the daily guest/session cleanup cron can run (`vercel.json` → `/api/cron/cleanup`). Build runs `prisma generate && prisma migrate deploy && next build`.

**Storage note:** Vercel **Function Storage** (Hobby ~10 GB) is *deployment* function-bundle retention — not your Neon database. Guest cleanup below frees **Postgres** rows. To reduce Function Storage, shorten the project’s [Deployment Retention Policy](https://vercel.com/docs/deployment-storage) and delete old unused deployments in the dashboard.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Migrate + production build |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Local Postgres via Docker Compose |
| `npm run db:migrate` / `db:deploy` | Prisma migrate |
| `npx tsx scripts/verify-defense-matchups.ts` | Trust guards for defense comps |
| `npx tsx scripts/verify-guest-entry.ts` | Guest/demo path regression (no DB) |
| `npx tsx scripts/verify-ephemeral-cleanup.ts` | Guest TTL helpers + cleanup route guards (no DB) |
| `npm run verify:cookie-crypto` | ESPN cookie encrypt-at-rest unit checks |

---

## Architecture (contributors)

```
src/lib/auth.ts                 Auth.js (Google, GitHub, email, guest) + JWT
src/lib/cleanup/ephemeral.ts    Guest wipe + cron purge (sessions, tokens, fat caches)
src/lib/espn/client.ts          ESPN Fantasy sync + scoreboard helpers
src/lib/espn/cookie-crypto.ts   AES-256-GCM encrypt/decrypt for SWID / espn_s2
src/lib/league/service.ts       Connect / sync / cached payload per user
src/lib/demo/seed.ts            Labeled demo league
src/lib/insights/engine.ts      Insights bundle
src/lib/insights/trade-*.ts     Chip helpers, suggestions, interactive grader
src/lib/insights/who-to-start.ts  Same-position start comparison
src/lib/insights/defense-matchups.ts  Finished-week comps only
src/lib/insights/trends.ts      Proj vs actual persistence (live ESPN only)
src/app/api/cron/cleanup        Daily Vercel Cron purge
src/app/api/guest/end-session   Immediate guest wipe on Sign out
src/app/(app)/*                 Authenticated pages (dashboard, team, …)
```

Pages: `/` (marketing), `/login`, `/dashboard`, `/team`, `/league`, `/players`, `/insights`, `/trades`, `/connect`.

Deeper notes for contributors: [docs/projections-and-trends.md](docs/projections-and-trends.md), [docs/ephemeral-cleanup.md](docs/ephemeral-cleanup.md).

---

## Limits (v1)

- Scoring assumption: **full PPR / 1QB** redraft. Dynasty, draft picks, and half-PPR toggles are out of scope.
- ESPN has no official consumer Fantasy API; private leagues depend on cookies that can expire. Cookies are encrypted at rest (AES-256-GCM); set `ESPN_COOKIE_ENCRYPTION_KEY` in production.
- Guest sessions are for trying the product; create an account to keep a lasting ESPN connection. Guest users and their league rows are deleted on Sign out and by the daily cleanup cron (`GUEST_SESSION_TTL_HOURS`, default 24h).
