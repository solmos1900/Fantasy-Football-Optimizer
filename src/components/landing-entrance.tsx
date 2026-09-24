"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Landing first-paint entrance — short staged fade/rise after mount.
 * Decorative only; CTAs remain immediately clickable.
 * Honors prefers-reduced-motion with an instant static fallback.
 */
export function LandingEntrance({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [phase, setPhase] = useState<"boot" | "animate" | "static">("boot");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setPhase("static");
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("animate"));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <div
      className={cn(
        "landing-entrance",
        phase === "animate" && "landing-entrance--run",
        phase === "static" && "landing-entrance--static",
        className,
      )}
    >
      {/* No-JS / CSS-disabled: keep content readable */}
      <noscript>
        <style>{`.landing-stage{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      {children}
    </div>
  );
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
