"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

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
    <header className="sticky top-0 z-40 border-b border-emerald-950/10 bg-[#F4F7F5]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="group flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-emerald-950 transition-colors group-hover:text-orange-600">
            Gridiron IQ
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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

        <div className="flex items-center gap-3">
          <Link
            href="/connect"
            className="hidden text-sm font-medium text-orange-700 hover:text-orange-800 sm:inline"
          >
            Connect
          </Link>
          {data?.user?.isGuest && (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-800">
              Guest
            </span>
          )}
          <span className="hidden max-w-[10rem] truncate text-sm text-emerald-950/60 sm:inline">
            {data?.user?.name ?? data?.user?.email}
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-md border border-emerald-950/15 px-2.5 py-1 text-xs font-medium text-emerald-950/80 transition hover:border-emerald-950/30 hover:bg-white"
          >
            Sign out
          </button>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-t border-emerald-950/5 px-2 py-2 md:hidden">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "shrink-0 rounded-md px-3 py-1 text-xs font-medium",
                active ? "bg-emerald-950 text-white" : "text-emerald-950/70",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
