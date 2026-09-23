"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function LinkPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <LoaderCircle
      aria-hidden
      className={cn(
        "h-3 w-3 shrink-0 animate-spin text-current transition-opacity duration-150",
        // Debounce flash on fast/prefetched navigations
        pending
          ? "opacity-100 [animation-delay:120ms] motion-reduce:opacity-100"
          : "opacity-0",
        className,
      )}
    />
  );
}

function PendingLinkInner({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        pending && "opacity-80",
        className,
      )}
      aria-busy={pending || undefined}
    >
      {children}
      <LinkPendingHint />
    </span>
  );
}

type PendingLinkProps = Omit<ComponentProps<typeof Link>, "children"> & {
  children: ReactNode;
  /** Extra classes applied to the inner pending wrapper (not the <a>). */
  contentClassName?: string;
};

/**
 * Next.js App Router Link with immediate pending feedback via useLinkStatus.
 * Shows a small spinner while navigation is in flight (before URL updates).
 */
export function PendingLink({
  children,
  className,
  contentClassName,
  ...props
}: PendingLinkProps) {
  return (
    <Link className={className} {...props}>
      <PendingLinkInner className={contentClassName}>{children}</PendingLinkInner>
    </Link>
  );
}
