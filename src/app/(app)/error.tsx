"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-8">
      <h1 className="type-page text-emerald-950">Something went wrong</h1>
      <p className="type-body text-emerald-950/65">
        The page hit an unexpected error. Your guest or signed-in session is
        still here — try again, or go back to Home and reload the demo league.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" onClick={() => reset()}>
          Try again
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            window.location.href = "/dashboard";
          }}
        >
          Back to Home
        </Button>
      </div>
    </div>
  );
}
