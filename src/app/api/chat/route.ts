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
  CHAT_GATEWAY_UNAVAILABLE_NOTICE,
  CHAT_MAX_TOOL_STEPS,
  CHAT_MODEL_ID,
} from "@/lib/chat/config";
import { loadChatDataContext } from "@/lib/chat/player-resolve";
import {
  consumeChatRateLimit,
  guestBucketKey,
  userBucketKey,
} from "@/lib/chat/rate-limit";
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

  const isGuest = Boolean(session.user.isGuest);
  const bucketKey = isGuest
    ? guestBucketKey(
        clientIpFromHeaders(req.headers),
        session.user.id,
      )
    : userBucketKey(session.user.id);

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

  const { messages: rawMessages, conversationId, templatePayload } = parsed.data;
  const messages = rawMessages as UIMessage[];

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

  // Enrich last user message if template was attached
  let workingMessages = messages;
  if (templatePayload) {
    const tp = chatTemplatePayloadSchema.safeParse(templatePayload);
    if (tp.success) {
      const text = templateUserText(tp.data);
      workingMessages = [
        ...messages.slice(0, -1),
        {
          ...(messages[messages.length - 1] as UIMessage),
          role: "user",
          parts: [{ type: "text", text }],
        } as UIMessage,
      ];
    }
  }

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
      temperature: 0.2,
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
