import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: number;
  /**
   * `app` — chrome mark (nav / wordmark).
   * `hero` — larger landing mark.
   */
  variant?: "app" | "hero";
  /**
   * `dark` — white helmet on #0B0B0B with neon-purple GIQ + orbit (default / dark-first).
   * `light` — dark helmet on #FFFFFF for light surfaces.
   */
  tone?: "dark" | "light";
};

/** GIQ + neon-purple Helmet Orbit masters (lossless 1024 PNGs; Image uses unoptimized). */
const MARK_SRC = {
  dark: "/icons/helmet-orbit-giq-dark-1024.png",
  light: "/icons/helmet-orbit-giq-light-1024.png",
} as const;

/**
 * Helmet Orbit mark — GIQ + neon-purple orbit.
 * Served unoptimized so next/image does not requantize the silhouette
 * (lossy compression made Preview look crusty).
 */
export function BrandMark({
  className,
  size = 36,
  variant: _variant = "app",
  tone = "dark",
}: BrandMarkProps) {
  return (
    <Image
      src={MARK_SRC[tone]}
      width={size}
      height={size}
      alt=""
      className={cn("shrink-0", className)}
      unoptimized
      aria-hidden
      draggable={false}
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
