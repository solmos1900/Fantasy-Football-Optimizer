"use client";

import { CHAT_TEMPLATES, type ChatTemplateId } from "@/lib/chat/templates";
import { cn } from "@/lib/utils";

export function TemplateButtons({
  onPick,
  disabled,
  className,
}: {
  onPick: (id: ChatTemplateId) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap justify-center gap-2",
        className,
      )}
    >
      {CHAT_TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(t.id)}
          className="rounded-lg border border-emerald-950/15 bg-[color-mix(in_srgb,var(--kraft)_60%,transparent)] px-3 py-2 text-left transition hover:border-orange-500/40 hover:bg-orange-600/10 disabled:opacity-50"
        >
          <span className="block text-sm font-semibold text-emerald-950">
            {t.label}
          </span>
          <span className="type-caption text-emerald-950/45">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}
