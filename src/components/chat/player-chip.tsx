"use client";

import { X } from "lucide-react";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import { cn } from "@/lib/utils";
import type { MentionRef } from "@/lib/chat/templates";

export function PlayerChip({
  player,
  onRemove,
  className,
}: {
  player: MentionRef;
  onRemove?: () => void;
  className?: string;
}) {
  const label = formatPlayerLabel(player.name, player.nflTeam);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border border-orange-500/35 bg-orange-600/15 px-2 py-1 text-xs font-semibold text-emerald-950",
        className,
      )}
      data-espn-id={player.espnId}
    >
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          className="shrink-0 rounded p-0.5 text-emerald-950/50 hover:bg-orange-600/25 hover:text-emerald-950"
          onClick={onRemove}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
