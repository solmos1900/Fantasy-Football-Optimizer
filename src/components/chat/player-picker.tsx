"use client";

import { useEffect, useState } from "react";
import { PlayerChip } from "@/components/chat/player-chip";
import type { MentionHit } from "@/lib/chat/mention-search";
import type { MentionRef } from "@/lib/chat/templates";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  players: MentionRef[];
  onChange: (next: MentionRef[]) => void;
  max?: number;
  className?: string;
};

export function PlayerPicker({
  label,
  players,
  onChange,
  max = 6,
  className,
}: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<MentionHit[]>([]);

  useEffect(() => {
    if (!open || q.trim().length < 1) return;
    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/players/search?q=${encodeURIComponent(q)}&limit=8`,
          { signal: ac.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { players: MentionHit[] };
        const taken = new Set(players.map((p) => p.espnId));
        setHits((data.players ?? []).filter((h) => !taken.has(h.espnId)));
      } catch {
        /* ignore */
      }
    }, 120);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [q, open, players]);

  const visibleHits = open && q.trim().length >= 1 ? hits : [];

  function add(hit: MentionHit) {
    if (players.length >= max) return;
    onChange([
      ...players,
      {
        espnId: hit.espnId,
        name: hit.name,
        nflTeam: hit.nflTeam,
        position: hit.position,
      },
    ]);
    setQ("");
    setOpen(false);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="type-eyebrow text-orange-700">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <PlayerChip
            key={p.espnId}
            player={p}
            onRemove={() =>
              onChange(players.filter((x) => x.espnId !== p.espnId))
            }
          />
        ))}
      </div>
      {players.length < max ? (
        <div className="relative">
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="Add player"
            className="field-input w-full text-sm"
            aria-label={`Add player to ${label}`}
          />
          {visibleHits.length > 0 ? (
            <ul className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-emerald-950/15 bg-[var(--surface)] shadow-lg">
              {visibleHits.map((h) => (
                <li key={h.espnId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-orange-600/15"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(h)}
                  >
                    <span>{h.label}</span>
                    <span className="type-caption text-emerald-950/45">
                      {h.position}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
