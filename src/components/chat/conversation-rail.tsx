"use client";

import { MessageSquarePlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConversationItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export function ConversationRail({
  items,
  activeId,
  onSelect,
  onNew,
  onDelete,
  open,
  onToggle,
}: {
  items: ConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 text-xs font-semibold text-orange-700 hover:text-orange-800 sm:hidden"
      >
        {open ? "Hide chats" : "Past chats"}
      </button>
      <aside
        className={cn(
          "shrink-0 space-y-2 sm:block sm:w-48 lg:w-56",
          open ? "block" : "hidden sm:block",
        )}
      >
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-500/35 bg-orange-600/15 px-2 py-2 text-sm font-semibold text-emerald-950 hover:bg-orange-600/25"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>
        <ul className="max-h-40 space-y-0.5 overflow-auto sm:max-h-[min(50vh,24rem)]">
          {items.map((c) => (
            <li key={c.id} className="group flex items-stretch gap-0.5">
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs",
                  c.id === activeId
                    ? "bg-orange-600/20 font-semibold text-emerald-950"
                    : "text-emerald-950/65 hover:bg-emerald-950/5",
                )}
              >
                {c.title || "New chat"}
              </button>
              <button
                type="button"
                aria-label={`Delete ${c.title}`}
                className="rounded-md px-1.5 text-emerald-950/30 opacity-0 hover:bg-danger/15 hover:text-danger group-hover:opacity-100"
                onClick={() => onDelete(c.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {!items.length ? (
            <li className="px-1 py-2 text-xs text-emerald-950/40">
              No past chats yet
            </li>
          ) : null}
        </ul>
      </aside>
    </>
  );
}
