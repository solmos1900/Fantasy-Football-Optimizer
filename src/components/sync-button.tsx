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
      className="rounded-md border border-emerald-950/20 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-950 shadow-sm transition hover:border-orange-600/40 hover:text-orange-800 disabled:opacity-60"
      title="Refresh saved league data — no need to re-enter League ID"
    >
      {pending ? "Syncing…" : "Sync league"}
    </button>
  );
}
