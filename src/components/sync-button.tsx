"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await fetch("/api/league/sync", { method: "POST" });
          router.refresh();
        })
      }
      title="Refresh saved league data — no need to re-enter League ID"
    >
      {pending ? "Syncing…" : "Sync league"}
    </Button>
  );
}
