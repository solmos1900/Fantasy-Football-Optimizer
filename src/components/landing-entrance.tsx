"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Landing first-paint entrance — short staged fade/rise.
 * Decorative only; CTAs remain immediately clickable.
 * Honors prefers-reduced-motion via CSS (instant/static).
 */
export function LandingEntrance({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("landing-entrance", className)}>{children}</div>;
}

export function LandingStage({
  stage,
  className,
  children,
}: {
  stage: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(`landing-stage landing-stage-${stage}`, className)}>
      {children}
    </div>
  );
}
