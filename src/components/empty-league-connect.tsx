"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { PendingLink } from "@/components/pending-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { scrollToTopNow } from "@/components/scroll-to-top";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  message: string;
  /** Optional footer under the peer CTAs (e.g. install hint). */
  children?: ReactNode;
  className?: string;
};

/**
 * Empty-state chrome with two equal peer CTAs: Load demo league | Connect ESPN.
 * Never nests demo under a single "Connect league" button.
 */
export function EmptyLeagueConnect({
  title,
  message,
  children,
  className,
}: Props) {
  return (
    <div className={cn("max-w-xl", className)}>
      <h1 className="type-page text-emerald-950">{title}</h1>
      <p className="type-body mt-2 text-emerald-950/65">{message}</p>
      <ConnectLeaguePeerCtas className="mt-6" />
      {children}
    </div>
  );
}

type CtaProps = {
  className?: string;
};

/**
 * Side-by-side peer actions for empty states (stack on mobile).
 * Demo hits the same connect API as ConnectLeagueForm; ESPN goes to /connect#espn.
 */
export function ConnectLeaguePeerCtas({ className }: CtaProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function connectDemo() {
    setError(null);
    setDemoLoading(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/league/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "demo" }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Demo connect failed");
          setDemoLoading(false);
          return;
        }
        scrollToTopNow();
        router.push("/dashboard");
        router.refresh();
      } catch {
        setError("Demo connect failed");
        setDemoLoading(false);
      }
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="primary"
          className="w-full"
          onClick={connectDemo}
          disabled={demoLoading}
          loading={demoLoading}
        >
          {demoLoading ? "Loading…" : "Load demo league"}
        </Button>
        <PendingLink
          href="/connect#espn"
          className={buttonVariants({
            variant: "secondary",
            className: cn(
              "w-full",
              demoLoading && "pointer-events-none opacity-60",
            ),
          })}
          aria-disabled={demoLoading || undefined}
          tabIndex={demoLoading ? -1 : undefined}
        >
          Connect ESPN league
        </PendingLink>
      </div>
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
