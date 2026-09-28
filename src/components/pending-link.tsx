"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Compact brand pulse — no board/cork glyphs during nav pending. */
function LinkPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand shadow-[0_0_8px_rgba(192,38,255,0.55)] transition-opacity duration-150",
        pending
          ? "animate-pulse opacity-100 [animation-delay:80ms] motion-reduce:opacity-100"
          : "opacity-0",
        className,
      )}
    />
  );
}

function PendingLinkInner({
  children,
  className,
  pendingHintClassName,
}: {
  children: ReactNode;
  className?: string;
  pendingHintClassName?: string;
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
      <LinkPendingHint className={pendingHintClassName} />
    </span>
  );
}

type PendingLinkProps = Omit<ComponentProps<typeof Link>, "children"> & {
  children: ReactNode;
  /** Extra classes applied to the inner pending wrapper (not the <a>). */
  contentClassName?: string;
  /** Classes for the pending pulse (e.g. absolute corner on compact tabs). */
  pendingHintClassName?: string;
};

/**
 * Next.js App Router Link with immediate pending feedback via useLinkStatus.
 * Shows a brand purple pulse while navigation is in flight (before URL updates).
 */
export function PendingLink({
  children,
  className,
  contentClassName,
  pendingHintClassName,
  ...props
}: PendingLinkProps) {
  return (
    <Link className={className} {...props}>
      <PendingLinkInner
        className={contentClassName}
        pendingHintClassName={pendingHintClassName}
      >
        {children}
      </PendingLinkInner>
    </Link>
  );
}
