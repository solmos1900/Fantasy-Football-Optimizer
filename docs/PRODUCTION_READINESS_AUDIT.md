# Gridiron IQ: production readiness audit

**Date:** 2026-10-25 (NFL 2026, Week 7) · **Commit audited:** `84d2c96` (main)

This audit covers the repo, a local production build, the guest user journey, the data connectors, the storage model, how data refreshes, how accurate the data is, and what has to change before a mass-market launch. It ends with a plan for charging for AI usage while keeping the AI assistant valuable as a stand-alone product.

---

## 0. How this audit was run

| Step | Result |
|---|---|
| `npm ci` | ✅ 0 vulnerabilities |
| `next build` (Next 16.4.3, Turbopack) | ✅ Compiles and typechecks; 30 routes |
| `npm run lint` | ❌ **11 errors**, 11 warnings (all errors are `react-hooks/set-state-in-effect`) |
| `prisma migrate deploy` on local Postgres 16 | ✅ All 12 migrations applied |
| `next start` + Playwright (iPhone-size viewport) | Guest journey walked across every app route (details in §2) |
| nflverse ingest (`scripts/ingest-nflverse-usage.ts --season 2026`) | ✅ Weeks 1–7 ingested |
| Accuracy cross-check: DB vs nflverse source CSV | ✅ **0 value mismatches** (§5) |
| 43 `verify:*` scripts | 35 pass · 8 fail: 6 need network or env, 1 is a stale test, 1 is a stale assertion (§7) |
| ESPN Fantasy, ESPN site API, Sleeper API | ⚠️ **Not reachable from the audit sandbox** (network policy). These connectors were audited by reading the code, plus the app's degraded-mode behaviour when they fail. |
| Vercel AI Gateway (chat) | ⚠️ No key in the sandbox. Chat was audited by reading the code, plus the "unavailable" path. |

---

## 1. Executive summary

The product has an unusually strong **data-honesty culture**: no invented numbers, explicit freshness labels, a golden-fixture CI gate, and `DataIssue` banners. Stored historical actuals matched the source exactly. The core is good.

It is **not ready for mass-market traffic yet**. The blockers fall into five themes:

1. **AI cost exposure.** Anyone can create unlimited guest accounts, and each one gets a fresh 20-question daily chat allowance. No token metering, no per-user spend cap, no bot protection. This is the first thing to fix before charging for anything (§6, P0-1).
2. **Market coverage.** Only ESPN leagues, only **full-PPR 1QB redraft**. ESPN is reached through unofficial endpoints, and private leagues need users to copy browser cookies out of DevTools. Sleeper and Yahoo, which are huge in this market, show "SOON". Half-PPR, superflex, and K/DST users get advice tuned for a different league (§3, §5).
3. **Scale and serverless fit.** The no-league player pool is rebuilt **inside page requests**, including up to thousands of single-row `UPDATE`s. Rate limiting is in-memory per instance. League data refreshes only when the user presses Sync (§4).
4. **Ops maturity.** CI runs only `npm audit` and the golden check. There is no lint/build/verify gate, no error monitoring, no product analytics, and no security headers (§7).
5. **Polish visible to end users.** The login page shows developer instructions about env vars. The Connect page still offers a "demo" that was removed. The onboarding video is a placeholder that 404s 9 times per session. Raw `fetch failed` errors appear in banners (§2).

---

## 2. User journeys (walked with Playwright)

### Landing → Login → Guest → Home (chat)
| Step | Observation | Severity |
|---|---|---|
| Landing `/` | Loads in about 0.3 s. Clear value prop. | ✅ |
| `/login` | Shows **developer-facing text to end users**: *"Google and GitHub OAuth are optional. Set AUTH_GOOGLE_\* / AUTH_GITHUB_\* … on Vercel to enable them."* Hide this when the env vars are unset, or show it only in dev. | P1 |
| `/login` → "Try as Guest" | A link, not a button. Display-name form, then into `/dashboard` in about 3.5 s. | ✅ |
| Home (`/dashboard` = chat) | The **"How to connect your league" modal opens on top of every app route** until it is dismissed, including Trades, which works without a league. "Walkthrough video coming soon" placeholder. `GET /onboarding/espn-safari.mp4` → **404, 9 times** in one session. | P1 |
| Chat send without gateway | Friendly notice: "AI chat is temporarily unavailable…". Handled well. | ✅ |
| `/trades` (guest) | **6.9 s** server render while upstreams were unreachable. Each failed upstream costs a full timeout plus retries in the request path. The banner shows raw text: *"Could not read the NFL scoreboard (fetch failed)… Projection/injury refresh failed (fetch failed)… Roster authority refresh failed (fetch failed)"*. Header falls back to **"current NFL week 1"**, which is wrong on Oct 25; it should fall back to the latest week in the DB or a date-based week. | P1 |
| `/team`, `/league`, `/players`, `/insights` (no league) | Clear "Connect an ESPN league to unlock" empty states. | ✅ |
| `/connect` | Copy says *"Pick demo or ESPN — both are available up front"*, but demo mode was removed (the API returns 400 for `mode: "demo"`). | P2 |
| Private ESPN connect | Users must open **DevTools → Application → Cookies** on a desktop and paste `SWID` + `espn_s2`. This is the biggest funnel killer for mass market: most fantasy players are on phones, and the guide itself says it needs "Safari on a computer". | **P0 for growth** |
| Email sign-up | Fails closed without `RESEND_API_KEY` (good). `EMAIL_FROM` defaults to `onboarding@resend.dev`, which only delivers to the Resend account owner, so prod needs a verified domain. | P1 (config) |

---

## 3. API connectors

| Connector | Used for | Official? | Code | Findings |
|---|---|---|---|---|
| **ESPN Fantasy v3** `lm-api-reads.fantasy.espn.com` | League, rosters, matchups, FAs, league projections and actuals | ❌ Unofficial | `src/lib/espn/client.ts` | **No timeout or retry**: `espnFetch` uses raw `fetch`, not `secureFetch`, so a hung ESPN call holds the function until the platform kills it. Unknown `defaultPositionId` silently maps to **WR** (`POS_MAP[...] ?? "WR"`). Matchups filter on `matchupPeriodId === latestScoringPeriod`, which breaks in multi-week playoff matchups where the matchup period ≠ the scoring period. `isLive` is effectively always true (`… \|\| currentMatchupPeriod === scoringPeriodId`). FA pool is capped at 50. `mSettings` scoring is fetched but **never used** for projections or advice. ToS risk for a paid product. |
| **ESPN site API** `site.api.espn.com` | Scoreboard, opponents, byes, news, injuries | ❌ Unofficial (public) | `espn/scoreboard.ts`, `news.ts`, `injuries.ts` | Fine for now. One scoreboard call per completed week runs on every sync (`enrichLeagueWithCompletedWeekOpponents`); cache these, since past weeks never change. |
| **ESPN public players** (`kona_player_info`) | No-league pool, injury and ownership overlay | ❌ | `players/espn-public.ts` | `limit: 350`. Refresh runs inside the page request when older than 12 min (`POOL_PROJECTION_TTL_MS`). |
| **Sleeper** `api.sleeper.app/v1/players/nfl` | Roster authority, id crosswalk | ✅ Public, documented | `sleeper/players.ts`, `sleeper/projections.ts` | The payload is about 5 MB+, and Sleeper asks callers to fetch it **at most once a day**. It is cached in module memory for 6 h (lost on every cold start) and via `next.revalidate`. The Next data cache skips items over 2 MB, so in practice each cold instance re-downloads it. It is also loaded **twice**, once by each module. Persist it to the DB once per day from a cron. |
| **Sleeper projections** `api.sleeper.app/projections/nfl/{season}/{week}` | All displayed projections (Who to Start, chat, trades) | ⚠️ **Undocumented** endpoint | `sleeper/projections.ts` | It can change or disappear without notice, and you are building a paid product on it. Have a fallback ready (ESPN projections already persisted, or a licensed feed). |
| **nflverse-data** GitHub releases | Completed-week actuals (full PPR), usage, snaps, id crosswalk | ✅ Open data (CC BY 4.0) | `src/lib/nflverse/*` | Solid: versioned rebuilds, completeness checks, a run log, `DataIssue`s. Attribution must be visible in the UI and on paid surfaces. |
| **Vercel AI Gateway → `google/gemini-2.5-flash`** | Chat | ✅ | `src/lib/chat/*`, `api/chat/route.ts` | See §6. |
| **Resend** | Email verification codes | ✅ | `src/lib/email/send.ts` | Needs a verified sending domain. |

### Connector roadmap for mass market
1. **Sleeper leagues (P0 for growth).** Sleeper's read API is public and needs no auth: user → leagues → rosters → matchups by username. It is the fastest win, with no cookies and works on phones.
2. **Yahoo (P1).** Official OAuth 2.0 Fantasy API.
3. **ESPN private leagues (P1).** Replace the DevTools cookie paste with a guided flow. A browser-extension or bookmarklet that captures `espn_s2`/`SWID` from an existing fantasy.espn.com login is the common pattern. Keep encrypting at rest (already AES-256-GCM, good).
4. NFL.com / CBS / Fleaflicker later.

---

## 4. Storage and refresh model

### What is stored where
| Data | Table | Write path | Notes |
|---|---|---|---|
| League snapshot | `LeagueConnection.cachedPayload` (**JSON in a `TEXT` column**) | Connect / Sync | Rewritten in full (up to 750 K chars, `CACHED_PAYLOAD_MAX_CHARS`) on every sync and parsed in full on every page load. Not queryable. |
| ESPN cookies | `LeagueConnection.espnSwid/espnS2` | Connect | AES-256-GCM. Fails closed when the key is missing. ✅ |
| Weekly player stats | `PlayerWeekStat` (unique `espnId, season, week, leagueId`) | nflverse cron (`leagueId=""`) + league sync (per `leagueId`) | **Rows multiply per league**: about 10 K leagues × ~200 players × 17 weeks ≈ **34 M rows per season**, mostly duplicated public facts. Keep public facts once (`leagueId=""`) and store only league-specific scoring deltas per league. |
| Trends | `PlayerTrendSnapshot` | Sync / Insights | Same per-league multiplication. |
| Multi-season ESPN history | `Espn*` (12 tables) | **None.** Schema comment says "writers land in PR B" | Dead schema today. Either ship it (good for a "league history" premium feature) or drop it. |
| Sync and cron log | `EspnRawResponse` (`view=nflverse_sync`) | Cron | Misused as a log table; give it its own `SyncRun` table. |
| Chat | `ChatConversation`, `ChatMessage` | Chat route | `partsJson` stores the full tool output, so it grows quickly. No retention policy. |
| Chat limits | `ChatRateLimit` | Chat route | Never purged (one row per bucket per day, unbounded). Add to the cleanup cron. |

### Refresh cadence
| Data | Trigger | Gap |
|---|---|---|
| League rosters, scores, FAs | **Manual "Sync" button only** | No background refresh. A user who opens Insights on Sunday morning sees whatever was synced last, possibly days ago. Add a scheduled sync for active leagues (e.g. Tue/Wed waivers, Thu–Mon game-day hourly) using a queue. |
| No-league pool projections and injuries | On page request, when the DB copy is older than 12 min | Runs in the **user's request**. With three upstreams failing, `/trades` took 6.9 s. When they succeed, it still does N single-row `UPDATE`s (up to 2,000 `faStubs` in a loop). Move this to a cron or queue that refreshes every 10 min on game days. Pages should only read. |
| Completed-week actuals (nflverse) | Cron Tue 17:00 UTC + Wed 14:00 UTC | Sunday games don't show until Tuesday afternoon. Users expect Sunday-night results. Add a Monday-morning and post-MNF run. For live/same-day actuals, use ESPN live box scores, labeled as "unofficial until nflverse confirms". |
| Health | `GET /api/health/data-freshness` | With an empty DB it reports **`stale: false`**. Empty should count as stale. |

### Database at scale
- Neon pooled URL + Prisma is fine. Add `connection_limit` and `pgbouncer=true` to the pooled URL, and use a direct URL for migrations (`directUrl`).
- Build runs `prisma migrate deploy` on every deploy (`scripts/migrate-deploy-retry.mjs`). Move migrations to a separate release step so preview builds can't race or lock prod.
- Backups and point-in-time restore: confirm the Neon plan's PITR window before you take money.

---

## 5. Data accuracy

### Verified
- **Completed-week actuals:** Every DB `actualPpr` for 2026 weeks 1–7 was compared against nflverse's published `fantasy_points_ppr` → **0 mismatches** across 1,831 player-weeks.
- **Coverage:** About 13% of nflverse skill-position rows (≈45–50 per week) are not stored, because they have no ESPN id in the crosswalk. Only **one** of them scored ≥ 5 PPR points (Myles Price, MIN, W3: 6.0). Low impact, but missing players can't be searched or added to trades. Fall back to the Sleeper id map to close the gap.
- **Partial-week handling:** On Sunday morning, Week 7 held only Thursday's game (18 rows). The pool uses the scoreboard's `latestCompletedWeek`, so partial weeks are not shown as complete. ✅ This depends on the ESPN scoreboard; when it is unreachable, the fallback is `currentWeek: 1`, which is wrong (see §2).

### Accuracy gaps that matter to paying users
| Gap | Impact | Fix |
|---|---|---|
| **Hard-coded full PPR.** Projections (Sleeper `pts_ppr`), Who to Start, trade value, and chat all assume full PPR, even for connected **half-PPR or standard** ESPN leagues. `mSettings` scoring is fetched and ignored. | WR/TE vs RB calls can flip in half-PPR, so the advice is wrong for a large share of leagues. | Read league `scoringSettings`. Recompute projections from Sleeper stat projections (the feed includes per-stat projections) with the league's scoring. Label the format everywhere. |
| **1QB only.** Superflex/2QB valuation is unsupported. Trade rules even block QB-for-skill swaps as a "hard reject". | Wrong trade verdicts in superflex leagues, a fast-growing format. | Read the roster slot counts from `mSettings`. Make the QB value curve depend on format. |
| **No K / D/ST** in the pool or tools | Users will ask chat about them | Add them, or say clearly that they are unsupported. |
| **Unknown ESPN position → WR** (`client.ts` `POS_MAP[...] ?? "WR"`) | Mislabelled players (e.g. FB, punters) | Map to `UNKNOWN` and exclude. |
| **Projection single point of failure** (undocumented Sleeper endpoint) | Everything shows "—" if it breaks | Fall back to ESPN projections already persisted in `PlayerWeekStat.projectedPpr`, labeled with the source. |
| **Injected roster players get `projectedPoints: 0`** (`pool.ts`) | Contradicts the project's own "never fake 0" rule (ACCURACY_RULES #7) | Use `null`. |
| **Chat can't resolve typed names.** Tools accept only ESPN ids, and ids come only from @-mention chips or templates. There is no `search_players` tool. | "Should I start Puka or Garrett Wilson?" typed as plain text leaves the model to guess ids or fail. This is the core promise of "ask in plain English". | Add a `find_players(name)` tool backed by `rankMentionHits`. |

---

## 6. AI chat: cost, abuse, and correctness

**Current design:** Gemini 2.5 Flash through Vercel AI Gateway. Up to 6 tool steps per turn, `temperature 0.2`. Numbers come from deterministic tools (good). Caps: guest 20/day, signed-in 80/day.

| # | Finding | Severity |
|---|---|---|
| P0-1 | **Guest limit is trivially bypassed.** The guest bucket key is `hash(ip + guestUserId)` (`chat/rate-limit.ts`). Guest sign-in creates a new user on every call, with no rate limit and no CAPTCHA (`auth.ts` guest provider). A script can create guests in a loop at 20 LLM calls each. | **P0** |
| P0-2 | **No token metering or spend cap.** Usage from `streamText` is never recorded, and limits count requests, not tokens. With 6 steps, a growing 80-message history, and large tool payloads, one "question" can cost many times another. | **P0** |
| P0-3 | **Client-supplied history is trusted.** `messages: z.array(z.unknown()).max(80)` has no per-message size cap, and the client can inject fake `assistant`/tool messages. That enables prompt injection and very large token bills. | **P0** |
| P1 | No login or password brute-force throttle: `credentials` sign-in has no rate limit, and `/api/auth/register` relies on an in-memory limiter that is per-instance only on serverless. | P1 |
| P1 | Every chat turn rebuilds the full player pool and the teammate-injury index (`loadChatDataContext`), adding latency and DB load to every message. Cache per week or TTL. | P1 |
| P2 | The model id is a code constant. Make it env-overridable, so you can A/B test or move paid tiers to a stronger model. | P2 |

**Fixes:**
- Rate-limit guest creation per IP. Add Turnstile or hCaptcha to guest and sign-up.
- Key guest chat limits by IP **and** a device cookie, not by user id.
- Rebuild history server-side for signed-in users from `ChatMessage` rows. For guests, cap to the last N user turns and drop client-sent tool parts.
- Cap each message at about 4 K chars.
- Record `usage.inputTokens/outputTokens` per turn into a `ChatUsage` table.
- Enforce a daily **token** budget per plan, plus a global kill-switch spend cap.

---

## 7. Engineering and ops gaps

| Area | Finding | Fix |
|---|---|---|
| CI | Only `audit:prod` + `verify:golden`. **Lint (11 errors), `next build`, and the 43 verify scripts are not gated.** | Add a `ci.yml` job: `lint` → `tsc --noEmit` → `next build` → offline verify suite. |
| Test drift | `verify:team-selection` asserts `SelectTeamPrompt` on `/dashboard`, which became chat, so connected users with no team picked get no prompt on Home. `verify:teammate-injury` and `verify:pool` don't load `.env`. `verify:sleeper-proj-name-match`, `live-stats-guest-week`, `insights`, and `nflverse-backfill` need live network. | Split the suite into offline (CI) and live (nightly), with recorded fixtures for the live ones. |
| Observability | No Sentry or OTel, no product analytics, no alerting on cron failure or golden failure (only `console.error`). | Sentry plus PostHog. Alert when `nflverse_sync` errors or `golden.ok=false`. |
| Security headers | No CSP, HSTS, `X-Frame-Options`, or `Referrer-Policy`. No `middleware`/`proxy`. | Add headers in `next.config.ts` `headers()`. |
| Rate limiting | In-memory `Map` per serverless instance (`http/rate-limit.ts`) | Use Upstash Redis, Vercel KV, or Vercel WAF rate rules. |
| Lint | 11 `set-state-in-effect` errors (install banner, onboarding, start-sit board, insights board, nav progress) | Use lazy `useState` initialisers or `useSyncExternalStore` for `localStorage`/media queries. |
| Legal / compliance | No Terms, Privacy Policy, or cookie notice. You store third-party session cookies (ESPN) and chat logs. Sole reliance on **unofficial ESPN and undocumented Sleeper endpoints for a paid product**. nflverse CC BY needs visible attribution. No account deletion or data export (GDPR/CCPA). | Write ToS and Privacy before charging. Add "Delete my account". Get legal review of data sourcing, or license a projections feed. |
| Seasonality | `DEFAULT_ESPN_SEASON` is a manual env var | Derive it from the date or the NFL state (Sleeper `/v1/state/nfl`). |
| Accessibility | Not audited in depth. The modal traps the page on every route. | Run an axe pass. |

---

## 8. Prioritised fix list

**P0: before inviting the public or charging** (status as of 2026-10-25, branch `claude/gallant-knuth-s276p8`)
1. ✅ Close the AI cost hole. Done: guest creation throttled per IP (5/h, 15/day) plus optional Turnstile; chat cap per guest **and** per IP (40/day); client history sanitised (text only, last 12 turns, 2 K chars per message); `maxOutputTokens`; per-turn token metering (`ChatUsage`); daily token budgets per caller and globally; `CHAT_DISABLED` kill-switch.
2. ✅ (mostly) Pool refresh is off the request path. Pages and chat read a stored `PlayerPoolSnapshot`; when stale, one rebuild runs after the response (`after()` + DB lease); the nflverse cron rebuilds it after ingest; `/api/cron/pool-refresh` is available for sub-daily schedulers. **Open:** the trade-tool display helpers (`loadToolDisplayMeta`, teammate-injury index) still fetch Sleeper projections and the scoreboard per request. Read them from the snapshot next.
3. ✅ ESPN fantasy and scoreboard calls go through `secureFetch` (timeout + 1 retry). Every other ESPN fetch has an `AbortSignal` timeout.
4. ✅ Rate limits are shared across instances (Postgres `ApiRateLimit`, atomic upsert; in-memory fallback if the DB is down). Password sign-in is throttled per email and per IP; verification routes are rate-limited.
5. ✅ CI gate (`.github/workflows/ci.yml`): lint (0 errors), `tsc`, migrations, 37-script `verify:offline`, `next build`.
6. ✅ (webhook) `OPS_ALERT_WEBHOOK_URL` alerts on unhandled server errors (`src/instrumentation.ts`), cron failures, golden-check failures and stale weeks, deduped. **Open:** a full error tracker (Sentry or similar) and product analytics need an account.
7. ✅ (drafts) `/terms`, `/privacy` (written from what the code actually stores), `/account` with self-serve deletion (cascade + `ChatUsage` detached). **Open:** legal review, and set `NEXT_PUBLIC_SUPPORT_EMAIL`.

**P1: mass-market fit**
1. Sleeper league connect, then Yahoo OAuth. A friendlier ESPN private-league flow.
2. League scoring awareness (half PPR, standard, superflex, TE premium) for projections, start/sit, trades, chat.
3. Scheduled league sync for active users. A post-MNF / Monday nflverse run.
4. Add a `find_players` chat tool.
5. Fix the end-user copy: OAuth env text on `/login`, the "demo" mention on `/connect`, raw `fetch failed` banners, the week-1 fallback, the onboarding modal on every route, the missing walkthrough video.
6. Persist the Sleeper player directory daily instead of per cold start.

**P2: scale and hygiene**
1. Stop duplicating public stats per league in `PlayerWeekStat` and `PlayerTrendSnapshot`.
2. Move `cachedPayload` to `jsonb` (or normalised tables). Ship or drop the `Espn*` history tables.
3. Retention for `ChatRateLimit`, `ChatMessage.partsJson`, `EspnRawResponse`.
4. `data-freshness` should report `stale: true` on an empty DB.
5. K/DST support. Unknown position → exclude rather than WR.

---

## 9. Monetisation plan: charge for AI, sell it as a stand-alone product

### Positioning
**"Gridiron IQ: the fantasy assistant that shows its math."** Its edge over generic chatbots is that **numbers come from tools, not the model**: verifiable projections, real box scores, freshness labels. That is the product, and it works **without connecting a league** (the full NFL pool), which makes the AI sellable on its own. League connect is an upgrade, not a requirement.

### Unit economics (estimate: verify before pricing)
Cost per AI question ≈ (input tokens × input price + output tokens × output price) × tool steps. Gemini 2.5 Flash is a low-cost model and replies are one line, so most of the cost is **input**: system prompt, history, tool JSON. A reasonable working assumption is **under $0.01 per question** once history is trimmed, but **instrument it first** (P0-2) and price from measured p50/p95 tokens per question, using current AI Gateway rates. Target AI COGS of **≤ 15–20% of plan revenue** at the plan's cap.

### Tiers
| | **Free** | **Pro** | **Elite** |
|---|---|---|---|
| Price (suggested) | $0 | **$4.99/mo** or **$24.99/season pass** | **$9.99/mo** or **$49.99/season** |
| No-league tools (Trade Analyzer, Who to Start, outlook) | ✅ unlimited (deterministic, cheap) | ✅ | ✅ |
| AI questions | 5/day (account required, no guest AI) | 50/day | 200/day + stronger model option |
| Leagues | 1 | 3 | Unlimited, multi-platform |
| League sync | Manual | Auto-sync (daily, plus hourly on game days) | Auto + live in-game |
| Scoring formats | Full PPR | All formats, superflex, TE premium | All |
| Alerts | — | Injury / inactive alerts for your starters (push/email) | + waiver-target alerts, trade-offer grading from inbox |
| Weekly AI reports | — | "Tuesday waiver brief" + "Sunday start/sit brief" | + rest-of-season playoff planner |
| League history | — | — | Multi-season history (`Espn*` tables), rivalry stats |

**Season pass** matters more than the monthly price: fantasy football runs Sept–Jan, and monthly churn after Week 14 is brutal. Sell the pass from August through Week 4, then switch to a discounted "playoff push" pass (Weeks 10–17).

**Add-ons**
- **AI credit packs** ($2.99 for 100 questions) for free users who hit the cap on a big Sunday. These capture willingness to pay without a subscription.
- **League plan / Commissioner** ($29.99/season, whole league gets Pro). This drives viral acquisition: one buyer brings in 10–12 managers.

### Free-tier funnel
- Guests: deterministic tools only, **no AI** (this closes P0-1). Show a sample AI answer to demo value.
- Sign-up unlocks 5 AI questions a day. Hitting the cap shows an upgrade prompt **with the answer preview blurred**, not a dead end.
- Upgrade prompts at high-intent moments: after a trade verdict ("Get alerts if this player's role changes"), Sunday at 11 AM ET (inactives), Tuesday waivers.

### Implementation plan
| Phase | Work | Where |
|---|---|---|
| **1. Metering (1 wk)** | `ChatUsage` table (userId, conversationId, model, inputTokens, outputTokens, costMicros, createdAt). Write it in `streamText` `onFinish`. Daily per-user token budget plus a global spend kill-switch env var. Admin cost dashboard query. | `src/app/api/chat/route.ts`, `src/lib/chat/rate-limit.ts`, `prisma/schema.prisma` |
| **2. Entitlements (1 wk)** | `Subscription` (userId, plan, status, periodEnd, stripeCustomerId, stripeSubId) and `CreditLedger` (userId, delta, reason). An `entitlementsFor(userId)` helper drives caps, number of leagues, model choice, and auto-sync. Replace the constants `CHAT_USER_DAILY_LIMIT`/`CHAT_GUEST_DAILY_LIMIT`. | `src/lib/billing/*` |
| **3. Stripe (1 wk)** | Stripe Checkout (monthly + one-time season pass as a fixed-term entitlement), Customer Portal, webhook `/api/billing/webhook` (verify signature; handle `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`). Idempotent on event id. | `src/app/api/billing/*` |
| **4. Paywall UX (1 wk)** | Remaining-questions meter (the `x-chat-remaining` header already exists), upgrade sheet, `/pricing` page, plan badge in nav. | `src/components/chat/*` |
| **5. Premium features (2–4 wks)** | Scheduled league sync (queue: Vercel Queues, Inngest, or QStash). Injury alerts (Web Push for the PWA, email via Resend). Weekly AI briefs, generated once per league and cached, not per user. Scoring-format awareness. | crons + `src/lib/insights/*` |
| **6. Distribution** | Keep it a PWA to avoid the 30% app-store cut. If you ship native wrappers later, use web checkout where policy allows. | — |

**Before taking money:** P0 items in §8, ToS and Privacy with a refund policy, and a legal check on commercial use of unofficial ESPN and undocumented Sleeper endpoints. The safest path is to make Sleeper (public API) and Yahoo (official API) first-class, and to license a projections feed if paid volume justifies it.

### KPIs to track from day one
Activation (first AI answer within 2 min of sign-up) · league connect rate by platform · AI questions per weekly active user · free→paid conversion (target 3–5%) · AI COGS as % of revenue · Week 1→Week 12 retention · season-pass share of revenue.
