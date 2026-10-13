"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectGuide } from "@/components/onboarding/connect-guide";
import { PendingLink } from "@/components/pending-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  message: string;
  className?: string;
};

/**
 * League-only feature empty state — never fake data.
 * Primary CTA opens the connect guide; secondary goes to /connect#espn.
 */
export function LeagueLocked({ title, message, className }: Props) {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className={cn("max-w-xl", className)}>
      <h1 className="type-page text-emerald-950">{title}</h1>
      <p className="type-body mt-2 text-emerald-950/65">{message}</p>
      <p className="type-caption mt-3 text-emerald-950/50">
        Scoring defaults to full PPR until you connect a league.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={() => setGuideOpen(true)}
        >
          How to connect
        </Button>
        <PendingLink
          href="/connect#espn"
          className={buttonVariants({ variant: "secondary" })}
        >
          Connect ESPN league
        </PendingLink>
      </div>
      <ConnectGuide open={guideOpen} onDismiss={() => setGuideOpen(false)} />
    </div>
  );
}
