# Gridiron IQ

PPR fantasy football helper as a Progressive Web App. Connect an ESPN fantasy league (or try the labeled demo as a guest), see projected vs actual points, and get explainable start/sit, waiver, matchup, and trade guidance — not black-box magic.

Add it to your Home Screen on iPhone (Safari → Share → Add to Home Screen) for a full-screen app shortcut.

**Live:** [fantasyfootballoptimizer-kappa.vercel.app](https://fantasyfootballoptimizer-kappa.vercel.app)  
**Stack:** Next.js App Router, TypeScript, Tailwind CSS, Auth.js (NextAuth v5), Prisma + PostgreSQL (Neon on Vercel).

UI lock: Retro Draft Board + Helmet Orbit icon on solid dark charcoal (`#1c1c1c`).

---

## What it is

Gridiron IQ is a **full-PPR redraft helper** for managers who already play on ESPN Fantasy. It does not replace ESPN’s league host. It syncs your league (or loads a demo), stores that snapshot on your account or guest session, and surfaces weekly decisions with plain-English reasons.

| Path | Who it’s for |
|------|----------------|
| **Guest** | Try the product with only a display name. No email required. Guest sessions do not share data with later Google/GitHub/email accounts. |
| **Signed in** | Google, GitHub, or email/password. League connections persist on that account. |

After entry you choose how to get data: **Load demo league** or **Connect ESPN** — peer CTAs, neither nested under the other. In demo mode, your display name becomes your team name.

---

## Feature set

- **My Team** — Starters and bench with projected vs actual points and injury flags. Rows open a player drill-down.
- **Insights** — Weekly callouts: start/sit, waiver-style pickups, news, roster gaps, and matchup notes. Trend cards show projected vs actual over completed weeks.
- **Player detail** — This week’s matchup, recent form, and **similar players vs this defense** drawn only from real completed games in the synced (or labeled demo) data. Thin samples show an honest empty state — never invented weeks or points.
- **Trades** — Guided 3-step give/get analyzer against a league mate: pick who you trade with, what you send, what you get, then a verdict (Accept → Hard reject), chip totals, points differential (value gap), and who benefits / who loses, plus a Low/Medium/High partner-acceptance lean.
- **League / Players** — Standings, matchups, full rosters, and a searchable player pool.
- **Sync vs Connect** — **Connect** saves league ID (+ private cookies if needed) once on this account. **Sync** refreshes from that saved connection without re-entering the ID every session.
- **Live scoreboard** — NFL games from ESPN’s public scoreboard API (no API key).

---

## Where data comes from

| Signal | Source |
|--------|--------|
| Rosters, projections, actuals, matchups | ESPN Fantasy league APIs (unofficial endpoints the fantasy.espn.com web app uses), synced and cached per user |
| Opponent labels for completed weeks | ESPN public NFL scoreboard |
| Guest demo | In-app **labeled demo** seed (week aligned to completed weeks only). Demo comps are tagged Demo |
| News / injuries | ESPN public news feeds + roster injury flags — never invented |
| Trends (proj vs actual) | Stored on sync / Insights load in Postgres for that league connection |

**Honesty rules**

- Defense / similar-player comps use **completed weeks only** (never the current or future week).
- No seeded or hallucinated named-player week/point comps for live leagues.
- When the sample is thin, the UI says so and shows an empty state.
- Prior-season lines include the year so they are not confused with this season.

---

## How trades are graded (product level)

The Trade Analyzer and Insights trade ideas share the same **1QB full-PPR** chip model.

**Inputs (what you already see in-app)**

- This week’s projections and available actuals
- Recent form / proj-vs-actual trends when enough completed weeks exist
- Roster need (surplus vs hole at a position)
- Hard constraints typical of 1QB redraft (for example, one-sided QB-for-elite-skill swaps)

**Verdict shape**

- A plain-language call: Accept, Lean accept, Fair, Lean reject, or Hard reject
- Side chip totals and a **points differential** (value gap: what you get minus what you give on the chip scale)
- Short “for you” / “for them” notes so it’s clear **who benefits** and who is giving up more
- Partner acceptance lean as Low / Medium / High (or none if blocked) — a product judgment band, not a fake percentage

The engine is rule-based and explainable. Magic constants and full scoring source are intentionally not documented here.

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

Private ESPN leagues need `SWID` + `espn_s2` cookies from fantasy.espn.com while logged in — paste them in Connect. Treat cookies like passwords. See `.env.example` for details. **Never commit secrets.**

### Vercel

Production needs `AUTH_SECRET`, `DATABASE_URL` (pooled Neon URL preferred), and usually `AUTH_URL` + `AUTH_TRUST_HOST=true`. Build runs `prisma generate && prisma migrate deploy && next build`.

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

---

## Architecture (contributors)

```
src/lib/auth.ts                 Auth.js (Google, GitHub, email, guest) + JWT
src/lib/espn/client.ts          ESPN Fantasy sync + scoreboard helpers
src/lib/league/service.ts       Connect / sync / cached payload per user
src/lib/demo/seed.ts            Labeled demo league
src/lib/insights/engine.ts      Insights bundle
src/lib/insights/trade-*.ts     Chip helpers, suggestions, interactive grader
src/lib/insights/defense-matchups.ts  Completed-week comps only
src/lib/insights/trends.ts      Proj vs actual persistence
src/app/(app)/*                 Authenticated pages (dashboard, team, …)
```

Pages: `/` (marketing), `/login`, `/dashboard`, `/team`, `/league`, `/players`, `/insights`, `/trades`, `/connect`.

Deeper notes for contributors: [docs/projections-and-trends.md](docs/projections-and-trends.md).

---

## Limits (v1)

- Scoring assumption: **full PPR / 1QB** redraft. Dynasty, draft picks, and half-PPR toggles are out of scope.
- ESPN has no official consumer Fantasy API; private leagues depend on cookies that can expire.
- Guest sessions are for trying the product; create an account to keep a lasting ESPN connection.
