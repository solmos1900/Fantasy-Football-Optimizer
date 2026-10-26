"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { MentionHit } from "@/lib/chat/mention-search";

type Props = {
  query: string;
  open: boolean;
  onSelect: (player: MentionHit) => void;
  onClose: () => void;
  /** Anchor for keyboard highlight reset */
  className?: string;
};

export function MentionTypeahead({
  query,
  open,
  onSelect,
  onClose,
  className,
}: Props) {
  const listId = useId();
  const [hits, setHits] = useState<MentionHit[]>([]);
  // Query the current `hits` were fetched for; older results are never shown
  // (a quick pick could otherwise grab a player from the previous search).
  const [hitsFor, setHitsFor] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/players/search?q=${encodeURIComponent(query)}&limit=8`,
          { signal: ac.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { players: MentionHit[] };
        setHits(data.players ?? []);
        setHitsFor(query);
        setActive(0);
      } catch {
        /* aborted or network */
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [query, open]);

  const fresh = hitsFor === query;
  const visibleHits = useMemo(
    () => (open && fresh ? hits : []),
    [open, fresh, hits],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Keys handled here must not also reach the composer (Enter would
      // pick a player *and* send the message).
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === "Escape") {
        consume();
        onClose();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        // While results are loading, Enter does nothing rather than sending.
        consume();
        const hit = visibleHits[active];
        if (hit) onSelect(hit);
        return;
      }
      if (!visibleHits.length) return;
      if (e.key === "ArrowDown") {
        consume();
        setActive((i) => (i + 1) % visibleHits.length);
      } else if (e.key === "ArrowUp") {
        consume();
        setActive((i) => (i - 1 + visibleHits.length) % visibleHits.length);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, visibleHits, active, onSelect, onClose]);

  if (!open) return null;

  return (
    <div
      id={listId}
      role="listbox"
      aria-label="Player mentions"
      className={cn(
        "absolute bottom-full left-0 right-0 z-30 mb-2 max-h-56 overflow-auto rounded-xl border border-emerald-950/15 bg-[var(--surface)] shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      {(loading || !fresh) && !visibleHits.length ? (
        <p className="px-3 py-2 text-xs text-emerald-950/50">Searching…</p>
      ) : null}
      {!loading && fresh && !visibleHits.length ? (
        <p className="px-3 py-2 text-xs text-emerald-950/50">
          No players match “{query || "…"}”
        </p>
      ) : null}
      {visibleHits.map((h, i) => (
        <button
          key={h.espnId}
          type="button"
          role="option"
          aria-selected={i === active}
          className={cn(
            "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors",
            i === active
              ? "bg-orange-600/20 text-emerald-950"
              : "text-emerald-950/85 hover:bg-emerald-950/5",
          )}
          onMouseEnter={() => setActive(i)}
          onClick={() => onSelect(h)}
        >
          <span className="min-w-0 truncate font-medium">{h.label}</span>
          <span className="shrink-0 type-caption text-emerald-950/45">
            {h.position}
          </span>
        </button>
      ))}
    </div>
  );
}
