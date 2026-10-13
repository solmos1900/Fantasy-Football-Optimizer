"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { WalkthroughVideo } from "@/components/onboarding/walkthrough-video";
import { Button } from "@/components/ui/button";
import {
  ONBOARDING_PLATFORMS,
  type OnboardingPlatform,
  type OnboardingPlatformId,
} from "@/lib/onboarding/content";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onDismiss: () => void;
};

function videoSrcFor(platform: OnboardingPlatform): string {
  // Next inlines NEXT_PUBLIC_* when referenced as static member access.
  if (platform.id === "espn") {
    return (
      process.env.NEXT_PUBLIC_ONBOARDING_ESPN_VIDEO_URL?.trim() ||
      platform.defaultVideoPath
    );
  }
  if (platform.id === "sleeper") {
    return (
      process.env.NEXT_PUBLIC_ONBOARDING_SLEEPER_VIDEO_URL?.trim() ||
      platform.defaultVideoPath
    );
  }
  return (
    process.env.NEXT_PUBLIC_ONBOARDING_OTHER_VIDEO_URL?.trim() ||
    platform.defaultVideoPath
  );
}

/**
 * First-run "How to connect your league" guide.
 * Desktop: centered dialog. Mobile: same dialog pattern (not a dark bottom sheet).
 */
export function ConnectGuide({ open, onDismiss }: Props) {
  const titleId = useId();
  const [platformId, setPlatformId] =
    useState<OnboardingPlatformId>("espn");
  const [stepIndex, setStepIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const platform =
    ONBOARDING_PLATFORMS.find((p) => p.id === platformId) ??
    ONBOARDING_PLATFORMS[0];

  const slides = platform.available
    ? [
        {
          id: `${platform.id}-intro`,
          kind: "intro" as const,
          title: `Connect with ${platform.label}`,
          body: platform.summary,
        },
        ...platform.steps.map((s) => ({
          id: s.id,
          kind: "step" as const,
          title: s.title,
          body: s.body,
          fieldLabels: s.fieldLabels,
        })),
      ]
    : [
        {
          id: `${platform.id}-soon`,
          kind: "soon" as const,
          title: `${platform.label} — Coming soon`,
          body: platform.comingSoonNote ?? "Coming soon.",
        },
      ];

  const lastIndex = slides.length - 1;
  const slide = slides[Math.min(stepIndex, lastIndex)] ?? slides[0];
  const isLastSlide = stepIndex >= lastIndex;
  const isLastPlatform =
    platformId === ONBOARDING_PLATFORMS[ONBOARDING_PLATFORMS.length - 1]?.id;

  useEffect(() => {
    if (!open) return;
    setPlatformId("espn");
    setStepIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nav helpers closed over latest state
  }, [open, stepIndex, platformId, onDismiss]);

  const selectPlatform = useCallback((id: OnboardingPlatformId) => {
    setPlatformId(id);
    setStepIndex(0);
  }, []);

  function goPrev() {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
      return;
    }
    const idx = ONBOARDING_PLATFORMS.findIndex((p) => p.id === platformId);
    if (idx > 0) {
      const prev = ONBOARDING_PLATFORMS[idx - 1];
      setPlatformId(prev.id);
      // Intro + N steps → last index is steps.length when available.
      setStepIndex(prev.available ? prev.steps.length : 0);
    }
  }

  function goNext() {
    if (stepIndex < lastIndex) {
      setStepIndex((i) => i + 1);
      return;
    }
    const idx = ONBOARDING_PLATFORMS.findIndex((p) => p.id === platformId);
    if (idx >= 0 && idx < ONBOARDING_PLATFORMS.length - 1) {
      setPlatformId(ONBOARDING_PLATFORMS[idx + 1].id);
      setStepIndex(0);
      return;
    }
    onDismiss();
  }

  function onPointerDown(e: ReactPointerEvent) {
    touchStartX.current = e.clientX;
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (touchStartX.current == null) return;
    const dx = e.clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 48) return;
    if (dx < 0) goNext();
    else goPrev();
  }

  if (!open) return null;

  const doneLabel =
    isLastSlide && isLastPlatform ? "Done" : isLastSlide ? "Next platform" : "Next";

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
          "relative z-[71] flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden",
          "rounded-2xl border border-white/10 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)]",
          "bg-[#1c1c1c]",
        )}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/8 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <BrandMark size={28} />
              <p className="type-eyebrow text-[#C026FF]">Gridiron IQ</p>
            </div>
            <h2
              id={titleId}
              className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-xl"
            >
              How to connect your league
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            Skip
          </button>
        </div>

        {/* Platform tabs */}
        <div
          className="flex gap-1 border-b border-white/8 px-3 pt-3 sm:px-4"
          role="tablist"
          aria-label="League platforms"
        >
          {ONBOARDING_PLATFORMS.map((p) => {
            const selected = p.id === platformId;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectPlatform(p.id)}
                className={cn(
                  "relative flex-1 rounded-t-lg px-2 py-2.5 text-center text-sm font-semibold transition-colors",
                  selected
                    ? "bg-white/5 text-white"
                    : "text-white/45 hover:text-white/75",
                )}
              >
                {p.label}
                {!p.available && (
                  <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-white/35">
                    Soon
                  </span>
                )}
                {selected && (
                  <span
                    className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#C026FF]"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Slide body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div
            key={`${platformId}-${slide.id}`}
            className="onboarding-slide space-y-4"
          >
            <WalkthroughVideo
              src={videoSrcFor(platform)}
              title={`${platform.label} walkthrough`}
            />

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C026FF]/90">
                {platform.available
                  ? `Step ${Math.min(stepIndex + 1, slides.length)} of ${slides.length}`
                  : "Not available yet"}
              </p>
              <h3 className="mt-1.5 text-base font-semibold text-white sm:text-lg">
                {slide.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                {slide.body}
              </p>
              {"fieldLabels" in slide &&
                slide.fieldLabels &&
                slide.fieldLabels.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {slide.fieldLabels.map((label) => (
                      <li
                        key={label}
                        className="rounded-md border border-[#C026FF]/35 bg-[#C026FF]/10 px-2.5 py-1 font-mono text-xs text-[#ecc0ff]"
                      >
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={goPrev}
            disabled={stepIndex === 0 && platformId === "espn"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition-colors hover:bg-white/5 disabled:pointer-events-none disabled:opacity-30"
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-1.5" aria-hidden>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                onClick={() => setStepIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === stepIndex
                    ? "w-5 bg-[#C026FF]"
                    : "w-1.5 bg-white/25 hover:bg-white/40",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goNext}
              className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition-colors hover:bg-white/5 sm:inline-flex"
              aria-label="Next"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={isLastSlide && isLastPlatform ? onDismiss : goNext}
            >
              {doneLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
