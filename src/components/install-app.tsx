"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  INSTALL_OPEN_EVENT,
  dismissInstallPrompt,
  isIosDevice,
  isSafariBrowser,
  isStandaloneDisplay,
  openInstallGuide,
  wasInstallDismissed,
} from "@/lib/pwa";

type GuideMode = "safari-steps" | "open-safari" | "generic";

function detectGuideMode(): GuideMode {
  if (isIosDevice()) {
    return isSafariBrowser() ? "safari-steps" : "open-safari";
  }
  return "generic";
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

const SAFARI_STEPS = [
  {
    title: "Tap Share",
    body: "In Safari, tap the Share button (square with an upward arrow) in the toolbar.",
  },
  {
    title: "Add to Home Screen",
    body: "Scroll the sheet and choose Add to Home Screen.",
  },
  {
    title: "Confirm Add",
    body: "Keep the name Gridiron IQ, then tap Add. Open it from your Home Screen anytime.",
  },
] as const;

export function InstallHowToLink({
  className,
  children = "How to install",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => openInstallGuide()}
      className={
        className ??
        "text-sm font-semibold text-orange-700 underline-offset-2 hover:underline"
      }
    >
      {children}
    </button>
  );
}

export function InstallAppExperience() {
  const titleId = useId();
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<GuideMode>("generic");
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const standaloneNow = isStandaloneDisplay();
    setStandalone(standaloneNow);
    setMode(detectGuideMode());
    // Soft banner for iPhone/iPad browser sessions only; desktop uses How to install.
    setBannerVisible(
      !standaloneNow && isIosDevice() && !wasInstallDismissed(),
    );
    setReady(true);

    function onOpen() {
      setMode(detectGuideMode());
      setSheetOpen(true);
      setCopied(false);
    }
    window.addEventListener(INSTALL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(INSTALL_OPEN_EVENT, onOpen);
  }, []);

  function closeSheet() {
    setSheetOpen(false);
  }

  function dismissBanner() {
    dismissInstallPrompt();
    setBannerVisible(false);
    setSheetOpen(false);
  }

  function copyLink() {
    const url = window.location.origin;
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        // Fallback for older Safari
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        setCopied(true);
      }
    });
  }

  if (!ready || standalone) return null;

  return (
    <>
      {bannerVisible && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-2"
          role="region"
          aria-label="Install Gridiron IQ"
        >
          <div className="mx-auto flex max-w-lg items-center gap-3 border border-emerald-950/15 bg-emerald-950 px-3 py-3 text-emerald-50 shadow-lg">
            <div className="min-w-0 flex-1">
              <p className="font-[family-name:var(--font-display)] text-sm uppercase tracking-wide">
                Install Gridiron IQ
              </p>
              <p className="mt-0.5 text-xs leading-snug text-emerald-50/75">
                Add to your Home Screen for a full-screen app shortcut.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode(detectGuideMode());
                setSheetOpen(true);
              }}
              className="shrink-0 bg-orange-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-orange-500"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              className="shrink-0 px-1 text-xs font-medium text-emerald-50/70 hover:text-white"
              aria-label="Maybe later"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {sheetOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-emerald-950/50 backdrop-blur-[2px]"
            aria-label="Close install guide"
            onClick={closeSheet}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-[61] w-full max-w-md border border-emerald-950/10 bg-[#F4F7F5] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4 shadow-xl sm:rounded-lg"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                  {mode === "open-safari"
                    ? "iPhone · Safari only"
                    : mode === "safari-steps"
                      ? "iPhone · 3 taps"
                      : "Home Screen"}
                </p>
                <h2
                  id={titleId}
                  className="mt-1 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-emerald-950"
                >
                  {mode === "open-safari"
                    ? "Open in Safari to install"
                    : "Add to Home Screen"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-md px-2 py-1 text-sm font-medium text-emerald-950/50 hover:bg-emerald-950/5 hover:text-emerald-950"
                aria-label="Close"
              >
                Close
              </button>
            </div>

            {mode === "safari-steps" && (
              <ol className="space-y-4">
                {SAFARI_STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-emerald-950 text-sm font-semibold text-emerald-50">
                      {index === 0 ? (
                        <ShareIcon className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-950">
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-emerald-950/65">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {mode === "open-safari" && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-emerald-950/70">
                  Apple requires Safari for Home Screen installs. Copy this link,
                  open Safari, paste it, then use Share → Add to Home Screen.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={
                      typeof window !== "undefined" ? window.location.origin : ""
                    }
                    className="min-w-0 flex-1 border border-emerald-950/15 bg-white px-3 py-2 text-base text-emerald-950 outline-none"
                    aria-label="App URL"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className="shrink-0 bg-emerald-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-50 hover:bg-emerald-900"
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            )}

            {mode === "generic" && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-emerald-950/70">
                  On iPhone or iPad, open this site in Safari, tap Share, then{" "}
                  <strong className="font-semibold text-emerald-950">
                    Add to Home Screen
                  </strong>
                  . On Android Chrome, use the browser menu → Install app / Add
                  to Home screen.
                </p>
                <ol className="space-y-3">
                  {SAFARI_STEPS.map((step, index) => (
                    <li key={step.title} className="flex gap-3 text-sm">
                      <span className="font-semibold text-orange-700">
                        {index + 1}.
                      </span>
                      <span className="text-emerald-950/75">
                        <span className="font-semibold text-emerald-950">
                          {step.title}.
                        </span>{" "}
                        {step.body}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-950/10 pt-4">
              <p className="text-xs text-emerald-950/50">
                Already installed? Open Gridiron IQ from your Home Screen.
              </p>
              <button
                type="button"
                onClick={dismissBanner}
                className="text-xs font-semibold uppercase tracking-wide text-emerald-950/55 hover:text-emerald-950"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
