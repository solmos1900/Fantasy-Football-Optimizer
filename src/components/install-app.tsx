"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import {
  INSTALL_OPEN_EVENT,
  dismissInstallPrompt,
  isIosDevice,
  isSafariBrowser,
  isStandaloneDisplay,
  openInstallGuide,
  wasInstallDismissed,
} from "@/lib/pwa";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const APP_TAB_BAR_ROUTES = [
  "/dashboard",
  "/team",
  "/league",
  "/players",
  "/insights",
  "/trades",
  "/connect",
];

function hasAppTabBar(pathname: string | null) {
  if (!pathname) return false;
  return APP_TAB_BAR_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

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

function HomePlusIcon({ className }: { className?: string }) {
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
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M12 14v4" />
      <path d="M10 16h4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const SAFARI_STEPS = [
  {
    title: "Tap Share",
    body: "In Safari, tap the Share button (square with an upward arrow) in the toolbar.",
    Icon: ShareIcon,
  },
  {
    title: "Add to Home Screen",
    body: "Scroll the share sheet and choose Add to Home Screen.",
    Icon: HomePlusIcon,
  },
  {
    title: "Tap Add",
    body: "Keep the name Gridiron IQ, then tap Add. Launch it from your Home Screen anytime.",
    Icon: CheckIcon,
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

/**
 * BVN-style primary install CTA for marketing surfaces.
 * Hidden when already running as a Home Screen / standalone app.
 */
export function InstallHeroCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!isStandaloneDisplay());
  }, []);

  if (!show) return null;

  return (
    <div className="animate-fade-up-delay-2 mt-4 w-full max-w-md">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full !text-orange-300 hover:!text-orange-200"
        onClick={() => openInstallGuide()}
      >
        Install the app
      </Button>
      <p className="type-caption mt-2 text-center text-emerald-950/55">
        Free. 3 taps in Safari. Full-screen Home Screen shortcut.
      </p>
    </div>
  );
}

export function InstallAppExperience() {
  const titleId = useId();
  const pathname = usePathname();
  const aboveTabBar = hasAppTabBar(pathname);
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
    // Soft banner for iPhone/iPad browser sessions only; desktop uses hero / How to install.
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
          className={cn(
            "fixed inset-x-0 z-50 px-3 pt-2",
            aboveTabBar
              ? "bottom-[calc(3.625rem+max(0.5rem,env(safe-area-inset-bottom,0px)))] pb-2"
              : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
          )}
          role="region"
          aria-label="Install Gridiron IQ"
        >
          <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-emerald-950/15 bg-emerald-950 px-3 py-3 text-emerald-50 shadow-lg">
            <div className="min-w-0 flex-1">
              <p className="type-brand text-base text-emerald-50">
                Install Gridiron IQ
              </p>
              <p className="type-caption mt-0.5 leading-snug text-emerald-50/75">
                Add to your Home Screen for a full-screen app shortcut.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setMode(detectGuideMode());
                setSheetOpen(true);
              }}
            >
              Install
            </Button>
            <button
              type="button"
              onClick={dismissBanner}
              className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-50/70 hover:bg-white/10 hover:text-white"
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
            className="surface-card relative z-[61] w-full max-w-md px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4 sm:mb-0"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-emerald-950/15 sm:hidden" />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="type-eyebrow text-orange-700">
                  {mode === "open-safari"
                    ? "iPhone · Safari only"
                    : mode === "safari-steps"
                      ? "iPhone · 3 taps"
                      : "Home Screen"}
                </p>
                <h2 id={titleId} className="type-section mt-1 text-emerald-950">
                  {mode === "open-safari"
                    ? "Open in Safari to install"
                    : "Add to Home Screen"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-lg px-2 py-1 text-sm font-medium text-emerald-950/50 hover:bg-emerald-950/5 hover:text-emerald-950"
                aria-label="Close"
              >
                Close
              </button>
            </div>

            {(mode === "safari-steps" || mode === "generic") && (
              <div className="space-y-4">
                {mode === "generic" && (
                  <p className="text-sm leading-relaxed text-emerald-950/70">
                    On iPhone or iPad, open this site in Safari. On Android
                    Chrome, use the browser menu → Install app / Add to Home
                    screen.
                  </p>
                )}
                <ol className="space-y-4">
                  {SAFARI_STEPS.map((step) => (
                    <li key={step.title} className="flex gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-950 text-emerald-50">
                        <step.Icon className="h-5 w-5" />
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
              </div>
            )}

            {mode === "open-safari" && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-emerald-950/70">
                  Apple requires Safari for Home Screen installs. Copy this
                  link, open Safari, paste it, then use Share → Add to Home
                  Screen.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={
                      typeof window !== "undefined"
                        ? window.location.origin
                        : ""
                    }
                    className="field-input min-w-0 flex-1"
                    aria-label="App URL"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                      className:
                        "shrink-0 !text-orange-300 hover:!text-orange-200",
                    })}
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
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
