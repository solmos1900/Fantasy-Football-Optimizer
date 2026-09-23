"use client";

import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTransition, type ComponentType, type SVGProps } from "react";
import {
  ArrowLeftRight,
  Home,
  Lightbulb,
  Shirt,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandWordmark } from "@/components/brand";
import { InstallHowToLink } from "@/components/install-app";
import { PendingLink } from "@/components/pending-link";
import { Button } from "@/components/ui/button";

type TabIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

const PRIMARY_TABS: {
  href: string;
  label: string;
  shortLabel: string;
  icon: TabIcon;
}[] = [
  { href: "/dashboard", label: "Home", shortLabel: "Home", icon: Home },
  { href: "/team", label: "My Team", shortLabel: "Team", icon: Shirt },
  { href: "/league", label: "League", shortLabel: "League", icon: Trophy },
  { href: "/players", label: "Players", shortLabel: "Players", icon: Users },
  {
    href: "/insights",
    label: "Insights",
    shortLabel: "Insights",
    icon: Lightbulb,
  },
  {
    href: "/trades",
    label: "Trades",
    shortLabel: "Trades",
    icon: ArrowLeftRight,
  },
];

function isTabActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();
  const { data } = useSession();
  const [signingOut, startSignOut] = useTransition();

  return (
    <>
      {/* Slim top chrome — brand + utilities (not primary section tabs) */}
      <header className="sticky top-0 z-40 border-b-[1.5px] border-emerald-950/12 bg-[color-mix(in_srgb,var(--surface)_92%,white)]/95 shadow-[0_1px_0_rgba(253,249,240,0.8)_inset,0_8px_24px_-18px_rgba(27,48,34,0.35)] backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-1.5 px-2.5 py-2.5 sm:gap-3 sm:px-4">
          <PendingLink href="/dashboard" className="group min-w-0 shrink">
            <BrandWordmark
              markSize={28}
              className="min-w-0 gap-1.5 transition-opacity group-hover:opacity-90 sm:gap-2.5 sm:[&_.type-brand]:text-2xl [&_.type-brand]:truncate [&_.type-brand]:text-base sm:[&_.type-brand]:text-lg"
            />
          </PendingLink>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-2.5">
            <InstallHowToLink className="px-1 py-1 text-xs font-medium text-emerald-950/55 hover:text-orange-700 sm:px-1.5 sm:text-sm">
              Install
            </InstallHowToLink>
            <PendingLink
              href="/connect"
              className="px-1 py-1 text-xs font-semibold text-orange-700 hover:text-orange-800 sm:px-1.5 sm:text-sm"
            >
              Connect
            </PendingLink>
            {data?.user?.isGuest ? (
              <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-800">
                Guest
              </span>
            ) : (
              <span className="hidden max-w-[10rem] truncate text-sm text-emerald-950/60 md:inline">
                {data?.user?.name ?? data?.user?.email}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={signingOut}
              disabled={signingOut}
              aria-label={signingOut ? "Signing out" : "Sign out"}
              onClick={() =>
                startSignOut(() => {
                  void signOut({ callbackUrl: "/" });
                })
              }
              className="min-h-9 shrink-0 px-1.5 text-xs whitespace-nowrap sm:px-3"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>

      {/* Primary destinations — fixed bottom tab bar (all breakpoints) */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-emerald-950/12 bg-[color-mix(in_srgb,var(--surface)_94%,white)]/95 shadow-[0_-8px_24px_-18px_rgba(27,48,34,0.35)] backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-6 px-1 pt-1 sm:px-2">
          {PRIMARY_TABS.map((tab) => {
            const active = isTabActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <PendingLink
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={tab.label}
                title={tab.label}
                className={cn(
                  "flex min-h-11 items-stretch justify-center rounded-lg px-0.5 py-1 transition-colors sm:min-h-12 sm:px-1",
                  active
                    ? "text-emerald-950"
                    : "text-emerald-950/45 hover:text-emerald-950/75",
                )}
                contentClassName="relative flex w-full flex-col items-center justify-center gap-0.5"
                pendingHintClassName="absolute -right-0.5 top-0 h-2.5 w-2.5"
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors sm:h-8 sm:w-8",
                    active && "bg-emerald-950 text-emerald-50",
                  )}
                >
                  <Icon
                    className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5"
                    strokeWidth={active ? 2.25 : 1.75}
                    aria-hidden
                  />
                </span>
                <span
                  className={cn(
                    "max-w-full truncate text-[10px] font-semibold leading-none tracking-tight sm:text-[11px]",
                    active ? "text-emerald-950" : "text-emerald-950/55",
                  )}
                >
                  {tab.shortLabel}
                </span>
              </PendingLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
