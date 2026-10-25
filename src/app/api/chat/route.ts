import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { auth } from "@/lib/auth";
import {
  CHAT_BUDGET_EXHAUSTED_NOTICE,
  CHAT_DISABLED_NOTICE,
  CHAT_GATEWAY_UNAVAILABLE_NOTICE,
  CHAT_MAX_OUTPUT_TOKENS,
  CHAT_MAX_TOOL_STEPS,
  CHAT_MODEL_ID,
  chatDisabled,
} from "@/lib/chat/config";
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
import { clientIpFromHeaders, chatRequestSchema } from "@/lib/chat/request";
import { buildChatSystemPrompt } from "@/lib/chat/system-prompt";
import { buildChatTools } from "@/lib/chat/tools";
import {
  appendMessages,
  createConversation,
} from "@/lib/chat/persistence";
import {
  formatPoolFreshnessLabel,
} from "@/lib/players/pool";
import {
  chatTemplatePayloadSchema,
  templateUserText,
} from "@/lib/chat/templates";
import { parseMentionChips } from "@/lib/chat/mention-search";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function gatewayConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim(),
  );
}

function jsonError(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError(401, { error: "Unauthorized" });
  }

  if (chatDisabled()) {
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
    if (!activeConversationId) {
      const created = await createConversation(session.user.id);
      activeConversationId = created.id;
    }
  }

  const ctx = await loadChatDataContext({ userId: session.user.id });
  const tools = buildChatTools(ctx);
  const freshnessLabel = formatPoolFreshnessLabel(ctx.freshness);

  const lastUserText = extractLastUserText(workingMessages);
  const mentionIds = [
    ...parseMentionChips(lastUserText).map((m) => m.espnId),
    ...(parsed.data.mentionEspnIds ?? []),
  ];

  const system = buildChatSystemPrompt({
    hasConnectedLeague: ctx.hasConnectedLeague,
    freshnessLabel,
    freshnessWarning: ctx.freshness.warning,
  });

  // Soft hint for the model with known mention ids
  const mentionHint =
    mentionIds.length > 0
      ? `\nKnown player ESPN ids from the user message chips: ${[...new Set(mentionIds)].join(", ")}.`
      : "";

  try {
    const result = streamText({
      model: CHAT_MODEL_ID,
      system: system + mentionHint,
      messages: await convertToModelMessages(workingMessages),
      tools,
      stopWhen: isStepCount(CHAT_MAX_TOOL_STEPS),
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      onEnd: async ({ totalUsage, steps }) => {
        try {
          await recordChatUsage({
            userId: session.user.id,
            isGuest,
            conversationId: activeConversationId,
            bucketKey,
            model: CHAT_MODEL_ID,
            steps: steps.length,
            usage: totalUsage,
          });
        } catch (err) {
          console.error("[chat] usage metering failed", err);
        }
      },
    });

    // Persist user turn for signed-in users (assistant saved on finish best-effort)
    if (!isGuest && activeConversationId && lastUserText) {
      void appendMessages({
        userId: session.user.id,
        conversationId: activeConversationId,
        titleFromUserText: lastUserText,
        messages: [{ role: "user", content: lastUserText }],
      }).catch(() => {});
    }

    const stream = toUIMessageStream({
      stream: result.stream,
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

function extractLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const parts = m.parts ?? [];
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    if (text.trim()) return text.trim();
  }
  return "";
}
