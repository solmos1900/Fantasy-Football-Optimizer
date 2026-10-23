# Fantasy AI chat

The Home tab (`/dashboard`) is a Cursor/ChatGPT-style fantasy football chat.

## Env vars (Vercel)

| Variable | Required | Notes |
|----------|----------|--------|
| `AI_GATEWAY_API_KEY` | Local / CI; optional on Vercel if OIDC works | Vercel → AI Gateway → API Keys |
| `VERCEL_OIDC_TOKEN` | Auto on Vercel | Injected for deployments — can auth the gateway without a key |
| `DATABASE_URL` | Yes | Chat conversations + rate-limit buckets + player search |

Model id: `CHAT_MODEL_ID` in `src/lib/chat/config.ts` (default `google/gemini-2.5-flash`).

## Manual steps after deploy

1. Set `AI_GATEWAY_API_KEY` on the Vercel project (Production + Preview), **or** confirm OIDC gateway auth works for the project.
2. Redeploy so Prisma migration `20261023170000_chat_conversations` runs (`ChatConversation`, `ChatMessage`, `ChatRateLimit`).
3. Smoke-test as guest: open Home, run a Trade template, confirm rate-limit message after ~20 questions.
4. Smoke-test signed-in with a connected league: ask “who is on my roster?” — should use league tools. As guest, the same question should show **Connect a league to unlock**.

## Architecture

- **UI:** `src/components/chat/*` — composer with `@` mentions, templates, tool-result cards.
- **API:** `POST /api/chat` (AI SDK `streamText` + tools), `GET /api/players/search`, conversation CRUD under `/api/chat/conversations`.
- **Tools:** wrap `comparePlayerPackages`, `whoBenefitsCopy`, `compareWhoToStart`, pool freshness — model never invents numbers.
- **Trade verdicts:** percentage gap vs the lower side (`whoBenefitsCopy`) — even &lt;5%, slight edge 5–15%, lopsided &gt;15%. UI tone is caution (never green) when someone shouldn't accept. Labels are Left/Right (or You give / You get).
- **Guests:** conversations in `localStorage`; rate limit by IP + guest user id.
- **Signed-in:** conversations in Neon; higher daily cap.
- **Screenshot QA:** `/ui-preview/chat` loads `live-sample.json` from `npm run build:chat-live-sample` (Sleeper + nflverse + ESPN → same tool runners). Sources: `docs/screenshots/CHAT_SCREENSHOT_SOURCES.md`.
