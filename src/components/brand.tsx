import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: number;
  /**
   * `app` — light Helmet Orbit for dark chrome (no cream tile).
   * `hero` — larger transparent light mark for marketing landing.
   */
  variant?: "app" | "hero";
};

/** Helmet Orbit mark — light transparent art for dark charcoal UI. */
export function BrandMark({
  className,
  size = 36,
  variant = "app",
}: BrandMarkProps) {
  // Light mark reads on #1c1c1c; cream squircle tile icons do not.
  const src =
    variant === "hero"
      ? "/icons/helmet-orbit-mark-light-512.png"
      : "/icons/helmet-orbit-mark-light-256.png";

  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt=""
      className={cn("shrink-0", className)}
      aria-hidden
      draggable={false}
      unoptimized
    />
  );
}

export function BrandWordmark({
  className,
  markSize = 36,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      <span className="type-brand leading-none text-emerald-950">
        Gridiron IQ
      </span>
    </span>
  );
}
