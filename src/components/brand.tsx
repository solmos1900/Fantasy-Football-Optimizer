import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: number;
  /**
   * `app` — cream squircle tile (PWA / chrome).
   * `hero` — transparent helmet + orbit only (marketing landing).
   */
  variant?: "app" | "hero";
};

/** Helmet Orbit mark — cream squircle (app) or floating transparent art (hero). */
export function BrandMark({
  className,
  size = 36,
  variant = "app",
}: BrandMarkProps) {
  const src =
    variant === "hero"
      ? "/icons/helmet-orbit-mark-512.png"
      : "/icons/icon-192.png";

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
