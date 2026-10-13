"use client";

import { useState } from "react";
import { ConnectGuide } from "@/components/onboarding/connect-guide";
import { Button } from "@/components/ui/button";

/**
 * Auth-free preview for screenshot / QA of the connect guide.
 * Gated so it never ships as a public product surface without the flag.
 */
export default function ConnectGuidePreviewPage() {
  const allowed =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ALLOW_UI_PREVIEW === "1";
  const [open, setOpen] = useState(true);

  if (!allowed) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-emerald-950/60">Preview disabled.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-4 py-10">
      <p className="type-eyebrow text-orange-700">UI preview</p>
      <h1 className="type-page text-emerald-950">Connect guide</h1>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        Open guide
      </Button>
      <ConnectGuide open={open} onDismiss={() => setOpen(false)} />
    </main>
  );
}
