"use client";

import { useEffect, useId } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { WalkthroughVideo } from "@/components/onboarding/walkthrough-video";
import { buttonVariants } from "@/components/ui/button";
import {
  COMING_SOON_PLATFORMS_NOTE,
  CONNECT_GUIDE_OPTIONS,
  espnWalkthroughVideoUrl,
} from "@/lib/onboarding/content";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onDismiss: () => void;
};

/**
 * First-run "Connect your league" guide: one screen, one short line per
 * platform, one button each. Detailed ESPN cookie help lives on /connect
 * beside the fields that need it.
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
            Connect your league
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/60">
            Unlock your roster, matchups and league-aware chat.
          </p>

          {videoUrl ? (
            <WalkthroughVideo
              src={videoUrl}
              title="ESPN walkthrough"
              className="mt-4"
            />
          ) : null}

          <ul className="mt-5 space-y-3">
            {CONNECT_GUIDE_OPTIONS.map((option, i) => (
              <li
                key={option.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5"
              >
                <p className="text-sm font-semibold text-white">
                  {option.label}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-white/60">
                  {option.body}
                </p>
                <Link
                  href={option.href}
                  onClick={onDismiss}
                  data-testid={`connect-guide-${option.id}`}
                  className={cn(
                    buttonVariants({
                      variant: i === 0 ? "primary" : "secondary",
                      size: "sm",
                    }),
                    "mt-3",
                  )}
                >
                  Connect {option.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs leading-relaxed text-white/40">
            {COMING_SOON_PLATFORMS_NOTE} No league? Trade Analyzer, Who to
            Start and chat already work on every NFL player.
          </p>
        </div>

        <div className="flex items-center justify-end border-t border-white/8 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
