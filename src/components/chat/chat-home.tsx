"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { BrandWordmark } from "@/components/brand";
import { ChatComposer } from "@/components/chat/chat-composer";
import {
  ConversationRail,
  type ConversationItem,
} from "@/components/chat/conversation-rail";
import { MessageList } from "@/components/chat/message-list";
import { TemplateButtons } from "@/components/chat/template-buttons";
import { TemplateCard } from "@/components/chat/template-cards";
import { PendingLink } from "@/components/pending-link";
import {
  deleteGuestConversation,
  listGuestConversations,
  loadGuestMessages,
  newGuestConversationId,
  saveGuestConversation,
} from "@/lib/chat/guest-store";
import {
  templateUserText,
  type ChatTemplateId,
  type ChatTemplatePayload,
} from "@/lib/chat/templates";
import { mentionChipsToDisplay } from "@/lib/chat/mention-search";

type Props = {
  isGuest: boolean;
  hasLeague: boolean;
  userName?: string | null;
};

export function ChatHome({ isGuest, hasLeague, userName }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [railItems, setRailItems] = useState<ConversationItem[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<ChatTemplateId | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingTemplate, setPendingTemplate] =
    useState<ChatTemplatePayload | null>(null);
  const [pendingMentions, setPendingMentions] = useState<number[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, id, body }) => ({
          body: {
            ...body,
            id,
            messages,
            conversationId,
            templatePayload: pendingTemplate,
            mentionEspnIds: pendingMentions,
          },
        }),
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          if (!res.ok) {
            let notice: string | undefined;
            try {
              const data = (await res.clone().json()) as {
                notice?: string;
                error?: string;
              };
              notice = data.notice ?? data.error;
            } catch {
              /* ignore */
            }
            if (notice) {
              throw new Error(notice);
            }
          }
          return res;
        },
      }),
    [conversationId, pendingTemplate, pendingMentions],
  );

  const { messages, setMessages, sendMessage, status, error, clearError } =
    useChat({
      transport,
      id: conversationId ?? undefined,
      onError: (err) => {
        const msg = err.message || "Something went wrong.";
        // Prefer server notice JSON if present
        try {
          const parsed = JSON.parse(msg) as { notice?: string };
          if (parsed.notice) {
            setNotice(parsed.notice);
            return;
          }
        } catch {
          /* plain */
        }
        if (/503|gateway|AI_GATEWAY|fetch failed/i.test(msg)) {
          setNotice(
            "AI chat is temporarily unavailable. Trade Analyzer and Who to Start still work under Trades.",
          );
        } else if (/429|rate/i.test(msg)) {
          setNotice(msg);
        } else {
          setNotice(msg);
        }
      },
      onFinish: () => {
        setPendingTemplate(null);
        setPendingMentions([]);
      },
    });

  const busy = status === "submitted" || status === "streaming";

  const refreshRail = useCallback(async () => {
    if (isGuest) {
      setRailItems(listGuestConversations());
      return;
    }
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as {
        conversations: ConversationItem[];
      };
      setRailItems(data.conversations ?? []);
    } catch {
      /* ignore */
    }
  }, [isGuest]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Yield so setState is not synchronous in the effect body (lint).
      await Promise.resolve();
      if (cancelled) return;
      if (isGuest) {
        setRailItems(listGuestConversations());
        return;
      }
      try {
        const res = await fetch("/api/chat/conversations");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          conversations: ConversationItem[];
        };
        if (!cancelled) setRailItems(data.conversations ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGuest]);

  // Persist guest messages locally (rail refresh deferred)
  useEffect(() => {
    if (!isGuest || !conversationId) return;
    if (!messages.length) return;
    const title =
      mentionChipsToDisplay(
        messages.find((m) => m.role === "user")?.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ") ?? "New chat",
      ).slice(0, 48) || "New chat";
    saveGuestConversation(conversationId, title, messages);
    const t = window.setTimeout(() => {
      setRailItems(listGuestConversations());
    }, 0);
    return () => window.clearTimeout(t);
  }, [isGuest, conversationId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function startNewChat() {
    setNotice(null);
    clearError();
    setActiveTemplate(null);
    setPendingTemplate(null);
    setMessages([]);
    if (isGuest) {
      const id = newGuestConversationId();
      setConversationId(id);
      saveGuestConversation(id, "New chat", []);
      await refreshRail();
      return;
    }
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        conversation?: { id: string };
      };
      setConversationId(data.conversation?.id ?? null);
      await refreshRail();
    } catch {
      setConversationId(null);
    }
  }

  async function openConversation(id: string) {
    setNotice(null);
    clearError();
    setActiveTemplate(null);
    setConversationId(id);
    if (isGuest) {
      setMessages(loadGuestMessages(id));
      return;
    }
    try {
      const res = await fetch(`/api/chat/conversations/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: {
          id: string;
          role: string;
          content: string;
          partsJson: string | null;
        }[];
      };
      const ui: UIMessage[] = (data.messages ?? []).map((m) => {
        let parts: UIMessage["parts"] = [
          { type: "text", text: m.content },
        ];
        if (m.partsJson) {
          try {
            parts = JSON.parse(m.partsJson) as UIMessage["parts"];
          } catch {
            /* keep text */
          }
        }
        return {
          id: m.id,
          role: m.role as UIMessage["role"],
          parts,
        };
      });
      setMessages(ui);
    } catch {
      setMessages([]);
    }
  }

  async function removeConversation(id: string) {
    if (isGuest) {
      deleteGuestConversation(id);
      if (conversationId === id) {
        setMessages([]);
        setConversationId(null);
      }
      await refreshRail();
      return;
    }
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (conversationId === id) {
      setMessages([]);
      setConversationId(null);
    }
    await refreshRail();
  }

  async function ensureConversation(): Promise<string | null> {
    if (conversationId) return conversationId;
    if (isGuest) {
      const id = newGuestConversationId();
      setConversationId(id);
      return id;
    }
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = (await res.json()) as { conversation?: { id: string } };
    const id = data.conversation?.id ?? null;
    setConversationId(id);
    return id;
  }

  async function handleSend(text: string, mentionEspnIds: number[]) {
    setNotice(null);
    clearError();
    await ensureConversation();
    setPendingMentions(mentionEspnIds);
    setPendingTemplate(null);
    setActiveTemplate(null);
    await sendMessage({ text });
  }

  async function handleTemplateRun(payload: ChatTemplatePayload) {
    setNotice(null);
    clearError();
    await ensureConversation();
    setPendingTemplate(payload);
    const ids =
      payload.type === "trade"
        ? [...payload.left, ...payload.right].map((p) => p.espnId)
        : payload.type === "who-to-start"
          ? payload.players.map((p) => p.espnId)
          : [payload.player.espnId];
    setPendingMentions(ids);
    setActiveTemplate(null);
    await sendMessage({ text: templateUserText(payload) });
  }

  const empty = messages.length === 0 && !activeTemplate;

  return (
    <div className="flex min-h-[calc(100dvh-8.5rem)] flex-col gap-3 sm:min-h-[calc(100dvh-7.5rem)] sm:flex-row sm:gap-6">
      <ConversationRail
        items={railItems}
        activeId={conversationId}
        onSelect={(id) => void openConversation(id)}
        onNew={() => void startNewChat()}
        onDelete={(id) => void removeConversation(id)}
        open={railOpen}
        onToggle={() => setRailOpen((v) => !v)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="type-eyebrow text-orange-700">Fantasy chat</p>
            <h1 className="type-section text-emerald-950">
              {userName ? `Hey ${userName.split(" ")[0]}` : "Ask Gridiron IQ"}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <PendingLink
              href="/trades"
              className="font-semibold text-orange-700 hover:text-orange-800"
            >
              Trade Analyzer
            </PendingLink>
            <span className="text-emerald-950/25">·</span>
            <PendingLink
              href="/trades?tool=who-to-start"
              className="font-semibold text-orange-700 hover:text-orange-800"
            >
              Who to Start
            </PendingLink>
            <span className="text-emerald-950/25">·</span>
            <PendingLink
              href="/insights"
              className="font-semibold text-orange-700 hover:text-orange-800"
            >
              Insights
            </PendingLink>
            {hasLeague ? (
              <>
                <span className="text-emerald-950/25">·</span>
                <PendingLink
                  href="/team"
                  className="font-semibold text-orange-700 hover:text-orange-800"
                >
                  Team
                </PendingLink>
              </>
            ) : null}
          </div>
        </div>

        {!hasLeague ? (
          <div className="mb-3 rounded-lg border border-orange-500/25 bg-orange-50/30 px-3 py-2 text-sm text-emerald-950/80">
            General NFL questions work now.{" "}
            <PendingLink
              href="/connect#espn"
              className="font-semibold text-orange-700 hover:text-orange-800"
            >
              Connect a league to unlock
            </PendingLink>{" "}
            roster and league answers.
          </div>
        ) : null}

        {notice || error ? (
          <div
            role="status"
            className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-emerald-950"
          >
            {notice ?? error?.message}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-emerald-950/10 bg-[color-mix(in_srgb,var(--background)_55%,transparent)]">
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
            {empty ? (
              <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-8 text-center sm:py-14">
                <BrandWordmark
                  markSize={40}
                  className="justify-center [&_.type-brand]:text-xl sm:[&_.type-brand]:text-2xl"
                />
                <div>
                  <p className="text-lg font-semibold tracking-tight text-emerald-950 sm:text-xl">
                    Your fantasy edge, in one chat
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-950/60">
                    Ask in plain English or tap a template. Numbers come from
                    Gridiron IQ tools — not the model.
                  </p>
                </div>
                <TemplateButtons
                  onPick={setActiveTemplate}
                  disabled={busy}
                />
              </div>
            ) : (
              <>
                <MessageList
                  messages={messages}
                  streaming={status === "streaming"}
                />
                <div ref={bottomRef} />
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-emerald-950/10 bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
            {activeTemplate ? (
              <div className="mb-3">
                <TemplateCard
                  templateId={activeTemplate}
                  onCancel={() => setActiveTemplate(null)}
                  onRun={(p) => void handleTemplateRun(p)}
                />
              </div>
            ) : !empty ? (
              <TemplateButtons
                className="mb-3 justify-start"
                onPick={setActiveTemplate}
                disabled={busy}
              />
            ) : null}
            <ChatComposer
              disabled={busy}
              onSend={(text, ids) => void handleSend(text, ids)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
