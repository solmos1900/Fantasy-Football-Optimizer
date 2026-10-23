"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type SyncResponse = {
  ok?: boolean;
  error?: string;
  warning?: string;
  league?: { lastSyncedAt?: string; syncWarnings?: string[] };
};

export function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  return (
    <div className="flex max-w-xs flex-col items-end gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        loading={pending}
        onClick={() => {
          setError(null);
          setWarning(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/league/sync", {
                method: "POST",
                cache: "no-store",
              });
              const data = (await res.json().catch(() => ({}))) as SyncResponse;
              if (!res.ok) {
                setError(
                  data.error ??
                    (res.status === 401
                      ? "Sign in again to sync your league."
                      : "Sync failed — Last sync was not updated."),
                );
                return;
              }
              const softWarning =
                data.warning ?? data.league?.syncWarnings?.[0] ?? null;
              if (softWarning) setWarning(softWarning);
              // Re-render server components so the header reads the new lastSyncedAt.
              router.refresh();
            } catch {
              setError(
                "Network error — could not reach sync. Last sync was not updated.",
              );
            }
          });
        }}
        title="Refresh saved league data — no need to re-enter League ID"
      >
        {pending ? "Syncing…" : "Sync league"}
      </Button>
      {error && (
        <p
          role="alert"
          className="text-right text-xs leading-snug text-red-400"
        >
          {error}
        </p>
      )}
      {!error && warning && (
        <p
          role="status"
          className="text-right text-xs leading-snug text-warning"
        >
          {warning}
        </p>
      )}
    </div>
  );
}
