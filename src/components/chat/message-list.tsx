"use client";

import type { UIMessage } from "ai";
import { ChatToolResultView } from "@/components/chat/tool-result-cards";
import { mentionChipsToDisplay } from "@/lib/chat/mention-search";
import { cn } from "@/lib/utils";

export function MessageList({
  messages,
  streaming,
}: {
  messages: UIMessage[];
  streaming?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-1 pb-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {streaming ? (
        <div className="flex items-center gap-2 px-1 text-xs text-emerald-950/45">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-orange-600" />
          Thinking…
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const parts = message.parts ?? [];

  return (
    <div
      className={cn(
        "animate-fade-up flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[min(100%,36rem)] space-y-2",
          isUser
            ? "rounded-2xl rounded-br-md bg-orange-600/20 px-3.5 py-2.5 text-sm text-emerald-950"
            : "w-full space-y-2",
        )}
      >
        {parts.map((part, i) => {
          if (part.type === "text") {
            const text = isUser
              ? mentionChipsToDisplay(part.text)
              : part.text;
            if (!text.trim()) return null;
            return (
              <p
                key={`${message.id}-t-${i}`}
                className={cn(
                  "whitespace-pre-wrap leading-relaxed",
                  !isUser && "text-sm font-medium text-emerald-950",
                )}
              >
                {text}
              </p>
            );
          }

          // AI SDK tool parts: type "tool-<name>" or dynamic tool
          if (
            typeof part.type === "string" &&
            (part.type.startsWith("tool-") || part.type === "dynamic-tool")
          ) {
            const toolPart = part as {
              type: string;
              state?: string;
              output?: unknown;
              input?: unknown;
            };
            if (
              toolPart.state === "output-available" ||
              toolPart.output != null
            ) {
              return (
                <div key={`${message.id}-tool-${i}`} className="w-full">
                  <ChatToolResultView output={toolPart.output} />
                </div>
              );
            }
            if (
              toolPart.state === "input-available" ||
              toolPart.state === "input-streaming"
            ) {
              return (
                <p
                  key={`${message.id}-tool-pending-${i}`}
                  className="type-caption text-emerald-950/45"
                >
                  Pulling stats…
                </p>
              );
            }
          }
          return null;
        })}
      </div>
    </div>
  );
}
