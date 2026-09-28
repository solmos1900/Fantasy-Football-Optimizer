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
   * `dark` — white helmet + neon-purple GIQ/orbit on transparent (default; charcoal UI).
   * `light` — dark helmet + neon-purple GIQ/orbit on transparent (light surfaces).
   */
  tone?: "dark" | "light";
};

/**
 * Transparent Helmet Orbit marks for in-app / landing UI.
 * Opaque Recraft masters under `helmet-orbit-giq-*-1024.png` and `icon-*.png`
 * stay reserved for favicon / PWA / apple-touch / maskable install assets.
 */
const MARK_SRC = {
  dark: "/icons/helmet-orbit-mark-transparent-1024.png",
  light: "/icons/helmet-orbit-mark-transparent-light-1024.png",
} as const;

/**
 * Helmet Orbit mark — GIQ + neon-purple orbit, transparent background.
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
