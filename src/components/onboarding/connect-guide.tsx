"use client";

import { useEffect, useId } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { WalkthroughVideo } from "@/components/onboarding/walkthrough-video";
import { buttonVariants } from "@/components/ui/button";
import {
  COMING_SOON_PLATFORMS_NOTE,
  ESPN_CONNECT_STEPS,
  espnWalkthroughVideoUrl,
} from "@/lib/onboarding/content";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onDismiss: () => void;
};

/**
 * First-run "Connect your league" guide: one screen, three short steps, one
 * primary action. The detailed cookie how-to lives on /connect beside the
 * fields that need it.
 */
export function ConnectGuide({ open, onDismiss }: Props) {
  const titleId = useId();
  const videoUrl = espnWalkthroughVideoUrl();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Dismiss connect guide"
        onClick={onDismiss}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-[71] flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col overflow-hidden",
          "rounded-2xl border border-white/10 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)]",
          "bg-[#1c1c1c]",
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <p className="type-eyebrow text-[#C026FF]">Gridiron IQ</p>
          </div>
          <h2
            id={titleId}
            className="mt-3 text-xl font-semibold tracking-tight text-white"
          >
            Connect your ESPN league
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/60">
            Unlock your roster, matchups and league-aware chat. Takes about a
            minute.
          </p>

          {videoUrl ? (
            <WalkthroughVideo
              src={videoUrl}
              title="ESPN walkthrough"
              className="mt-4"
            />
          ) : null}

          <ol className="mt-5 space-y-4">
            {ESPN_CONNECT_STEPS.map((step, i) => (
              <li key={step.id} className="flex gap-3">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C026FF]/15 text-xs font-semibold text-[#ecc0ff]"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/60">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-5 text-xs leading-relaxed text-white/40">
            {COMING_SOON_PLATFORMS_NOTE} No league? Trade Analyzer, Who to
            Start and chat already work on every NFL player.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/8 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white"
          >
            Not now
          </button>
          <Link
            href="/connect#espn"
            onClick={onDismiss}
            data-testid="connect-guide-cta"
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            Connect ESPN league
          </Link>
        </div>
      </div>
    </div>
  );
}
