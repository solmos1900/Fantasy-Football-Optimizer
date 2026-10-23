"use client";

import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp } from "lucide-react";
import { MentionTypeahead } from "@/components/chat/mention-typeahead";
import {
  extractMentionQuery,
  insertMentionChip,
  mentionChipsToDisplay,
  parseMentionChips,
  type MentionHit,
} from "@/lib/chat/mention-search";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  onSend: (text: string, mentionEspnIds: number[]) => void;
  placeholder?: string;
};

export function ChatComposer({
  disabled,
  onSend,
  placeholder = "Ask about a trade, start/sit, or @ a player…",
}: Props) {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const mention = extractMentionQuery(text, cursor);

  const selectMention = useCallback(
    (hit: MentionHit) => {
      if (!mention) return;
      const next = insertMentionChip(text, mention.start, mention.end, hit);
      setText(next.text);
      setCursor(next.cursor);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.cursor, next.cursor);
      });
    },
    [mention, text],
  );

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    const ids = parseMentionChips(trimmed).map((m) => m.espnId);
    onSend(trimmed, ids);
    setText("");
    setCursor(0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab")) {
      // Handled by typeahead capture listener
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      if (mention) return; // Enter selects mention
      e.preventDefault();
      submit();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mention) return;
    submit();
  }

  const displayPreview =
    parseMentionChips(text).length > 0
      ? mentionChipsToDisplay(text)
      : null;

  return (
    <form onSubmit={onSubmit} className="relative w-full">
      <MentionTypeahead
        open={Boolean(mention)}
        query={mention?.query ?? ""}
        onSelect={selectMention}
        onClose={() => {
          /* leave text; user can Esc via typeahead */
        }}
      />
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-emerald-950/15 bg-[color-mix(in_srgb,var(--kraft)_88%,transparent)] p-2 shadow-[0_0_0_1px_rgba(192,38,255,0.08),0_12px_40px_-24px_rgba(192,38,255,0.45)] focus-within:border-orange-500/40 focus-within:ring-2 focus-within:ring-[var(--ring-focus)]",
        )}
      >
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          enterKeyHint="send"
          autoComplete="off"
          spellCheck
          className="max-h-36 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-snug text-emerald-950 outline-none placeholder:text-emerald-950/35 sm:text-sm"
          style={{ fontSize: "16px" }} /* iOS Safari zoom guard */
          onChange={(e) => {
            setText(e.target.value);
            setCursor(e.target.selectionStart);
            // auto-grow
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
          }}
          onSelect={(e) =>
            setCursor((e.target as HTMLTextAreaElement).selectionStart)
          }
          onKeyUp={(e) =>
            setCursor((e.target as HTMLTextAreaElement).selectionStart)
          }
          onClick={(e) =>
            setCursor((e.target as HTMLTextAreaElement).selectionStart)
          }
          onKeyDown={onKeyDown}
          aria-label="Chat message"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          aria-label="Send"
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white transition hover:bg-orange-500 disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
      {displayPreview ? (
        <p className="sr-only">{displayPreview}</p>
      ) : null}
    </form>
  );
}
