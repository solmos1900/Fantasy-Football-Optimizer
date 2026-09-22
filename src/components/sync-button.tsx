"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await fetch("/api/league/sync", { method: "POST" });
          router.refresh();
        })
      }
      className="rounded-md border border-emerald-950/15 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-950 transition hover:border-emerald-950/30 disabled:opacity-60"
    >
      {pending ? "Syncing…" : "Sync now"}
    </button>
  );
}
