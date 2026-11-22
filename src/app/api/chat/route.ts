import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics/events";
import {
  CHAT_BUDGET_EXHAUSTED_NOTICE,
  CHAT_DISABLED_NOTICE,
  CHAT_GATEWAY_UNAVAILABLE_NOTICE,
  CHAT_MODEL_ID,
  chatDisabled,
  gatewayConfigured,
} from "@/lib/chat/config";
import { streamErrorText } from "@/lib/chat/stream-errors";
import { loadChatDataContext } from "@/lib/chat/player-resolve";
import {
  checkTokenBudget,
  consumeChatRateLimit,
  guestBucketKey,
  guestIpBucketKey,
  userBucketKey,
} from "@/lib/chat/rate-limit";
import { sanitizeChatHistory } from "@/lib/chat/history";
import { recordChatUsage } from "@/lib/chat/usage";
import {
  clientIpFromHeaders,
  chatRequestSchema,
  GUEST_CONVERSATION_ID_RE,
} from "@/lib/chat/request";
import {
  appendMessages,
  createConversation,
} from "@/lib/chat/persistence";
import {
  CHAT_GENERATION_SETTINGS,
  lastUserText,
  prepareChatTurn,
} from "@/lib/chat/turn";
import {
  chatTemplatePayloadSchema,
  templateUserText,
} from "@/lib/chat/templates";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function jsonError(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError(401, { error: "Unauthorized" });
  }

  // Launch analytics: how often people hit a cap or the kill switch.
  const blocked = (reason: string, isGuestUser: boolean) =>
    after(() =>
      trackEvent({
        name: "chat_blocked",
        userId: session.user.id,
        isGuest: isGuestUser,
        props: { reason },
      }),
    );

  if (chatDisabled()) {
    blocked("disabled", Boolean(session.user.isGuest));
    return jsonError(503, { error: "chat_disabled", notice: CHAT_DISABLED_NOTICE });
  }

  if (!gatewayConfigured()) {
    return jsonError(503, {
      error: "gateway_unavailable",
      notice: CHAT_GATEWAY_UNAVAILABLE_NOTICE,
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, { error: "Invalid JSON" });
  }

  const parsed = chatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, { error: "Invalid request", details: parsed.error.flatten() });
  }

  const { messages: rawMessages, conversationId, templatePayload } = parsed.data;

  // Enrich last user message if template was attached
  let clientMessages: unknown[] = rawMessages;
  if (templatePayload) {
    const tp = chatTemplatePayloadSchema.safeParse(templatePayload);
    if (tp.success) {
      const text = templateUserText(tp.data);
      clientMessages = [
        ...rawMessages.slice(0, -1),
        { id: "template", role: "user", parts: [{ type: "text", text }] },
      ];
    }
  }

  // Never forward client-supplied tool/assistant payloads verbatim (#P0-3).
  const history = sanitizeChatHistory(clientMessages);
  if (!history.ok) {
    return jsonError(400, { error: "invalid_messages", notice: history.error });
  }
  const workingMessages: UIMessage[] = history.messages;

  const isGuest = Boolean(session.user.isGuest);
  const ip = clientIpFromHeaders(req.headers);
  const bucketKey = isGuest
    ? guestBucketKey(ip, session.user.id)
    : userBucketKey(session.user.id);

  const budget = await checkTokenBudget({
    bucketKey,
    kind: isGuest ? "guest" : "user",
  });
  if (!budget.allowed) {
    blocked(budget.scope === "global" ? "global_budget" : "user_budget", isGuest);
    return jsonError(429, {
      error: "budget_exhausted",
      notice: CHAT_BUDGET_EXHAUSTED_NOTICE,
      remaining: 0,
    });
  }

  // Guests: one cap per guest session plus a shared cap per IP, because
  // signing in as a new guest used to mint a fresh quota every time.
  if (isGuest) {
    const ipRate = await consumeChatRateLimit({
      bucketKey: guestIpBucketKey(ip),
      kind: "guest-ip",
    });
    if (!ipRate.allowed) {
      blocked("guest_ip_cap", isGuest);
      return jsonError(429, {
        error: "rate_limited",
        notice: ipRate.message,
        limit: ipRate.limit,
        remaining: 0,
      });
    }
  }

  const rate = await consumeChatRateLimit({
    bucketKey,
    kind: isGuest ? "guest" : "user",
  });
  if (!rate.allowed) {
    blocked(isGuest ? "guest_cap" : "user_cap", isGuest);
    return jsonError(429, {
      error: "rate_limited",
      notice: rate.message,
      limit: rate.limit,
      remaining: 0,
    });
  }

  // Ensure conversation for signed-in users
  let activeConversationId = conversationId ?? null;
  if (!isGuest) {
    // A browser-local guest id is not a stored conversation: start a new one.
    if (activeConversationId && GUEST_CONVERSATION_ID_RE.test(activeConversationId)) {
      activeConversationId = null;
    }
    if (!activeConversationId) {
      try {
        const created = await createConversation(session.user.id);
        activeConversationId = created.id;
      } catch (error) {
        // Most likely the user row is gone (account deleted elsewhere).
        console.error("[chat] createConversation failed", error);
        return jsonError(401, {
          error: "unauthorized",
          notice: "Your session has expired. Please sign in again.",
        });
      }
    }
  }

  const ctx = await loadChatDataContext({ userId: session.user.id });
  const turn = await prepareChatTurn({
    ctx,
    messages: workingMessages,
    mentionEspnIds: parsed.data.mentionEspnIds,
  });
  const freshnessLabel = turn.freshnessLabel;
  const userText = lastUserText(workingMessages);

  try {
    const result = streamText({
      model: turn.model,
      system: turn.system,
      messages: turn.messages,
      tools: turn.tools,
      ...CHAT_GENERATION_SETTINGS,
      onEnd: async ({ totalUsage, steps }) => {
        try {
          await recordChatUsage({
            userId: session.user.id,
            isGuest,
            conversationId: activeConversationId,
            bucketKey,
            model: CHAT_MODEL_ID,
            steps: steps.length,
            toolCalls: steps.reduce((n, s) => n + s.toolCalls.length, 0),
            usage: totalUsage,
          });
        } catch (err) {
          console.error("[chat] usage metering failed", err);
        }
      },
    });

    // Persist user turn for signed-in users (assistant saved on finish best-effort)
    if (!isGuest && activeConversationId && userText) {
      void appendMessages({
        userId: session.user.id,
        conversationId: activeConversationId,
        titleFromUserText: userText,
        messages: [{ role: "user", content: userText }],
      }).catch(() => {});
    }

    const stream = toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error("[chat] stream failed", error);
        return streamErrorText(error);
      },
      onFinish: ({ messages: finalMessages }) => {
        if (isGuest || !activeConversationId) return;
        const assistant = [...finalMessages].reverse().find((m) => m.role === "assistant");
        if (!assistant) return;
        const content = assistant.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n")
          .trim() ?? "";
        void appendMessages({
          userId: session.user.id,
          conversationId: activeConversationId!,
          messages: [
            {
              role: "assistant",
              content,
              partsJson: JSON.stringify(assistant.parts ?? []),
            },
          ],
        }).catch(() => {});
      },
    });

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "x-chat-conversation-id": activeConversationId ?? "",
        "x-chat-remaining": String(rate.remaining),
        "x-chat-freshness": freshnessLabel,
      },
    });
  } catch (err) {
    console.error("[chat] streamText failed", err);
    return jsonError(503, {
      error: "gateway_unavailable",
      notice: CHAT_GATEWAY_UNAVAILABLE_NOTICE,
    });
  }
}
