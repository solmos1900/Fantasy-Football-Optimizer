"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { InstallHowToLink } from "@/components/install-app";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/team", label: "My Team" },
  { href: "/league", label: "League" },
  { href: "/players", label: "Players" },
  { href: "/insights", label: "Insights" },
];

export function AppNav() {
  const pathname = usePathname();
  const { data } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-emerald-950/10 bg-[color-mix(in_srgb,var(--surface)_88%,white)]/95 shadow-sm backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="group flex items-baseline gap-2">
          <span className="type-brand text-xl text-emerald-950 transition-colors group-hover:text-orange-600 sm:text-2xl">
            Gridiron IQ
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-emerald-950 text-emerald-50"
                    : "text-emerald-950/70 hover:bg-emerald-950/5 hover:text-emerald-950",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <InstallHowToLink className="hidden text-sm font-medium text-emerald-950/55 hover:text-orange-700 sm:inline" />
          <Link
            href="/connect"
            className="hidden text-sm font-semibold text-orange-700 hover:text-orange-800 sm:inline"
          >
            Connect
          </Link>
          {data?.user?.isGuest && (
            <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-800">
              Guest
            </span>
          )}
          <span className="hidden max-w-[10rem] truncate text-sm text-emerald-950/60 sm:inline">
            {data?.user?.name ?? data?.user?.email}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="min-h-9 px-3 text-xs"
          >
            Sign out
          </Button>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-t border-emerald-950/8 px-2 py-2 md:hidden">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                active
                  ? "bg-emerald-950 text-white"
                  : "text-emerald-950/70 hover:bg-emerald-950/5",
              )}
            >
              {link.label}
            </Link>
          );
        })}
        <InstallHowToLink className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-orange-700" />
      </nav>
    </header>
  );
}
