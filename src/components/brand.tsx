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
};

/** High-res transparent Helmet Orbit (Sebastian-approved ChatGPT mark). */
const MARK_SRC = "/icons/helmet-orbit-mark-light-2048.png";

/** Helmet Orbit mark — cream on transparent for charcoal UI. */
export function BrandMark({
  className,
  size = 36,
  variant = "app",
}: BrandMarkProps) {
  const isHero = variant === "hero";

  return (
    <Image
      src={MARK_SRC}
      width={size}
      height={size}
      alt=""
      className={cn("shrink-0", className)}
      sizes={
        isHero
          ? "(max-width: 640px) 96px, 112px"
          : `${Math.max(size, 36)}px`
      }
      // Source is 2048² — plenty for retina hero (~96–112 CSS).
      quality={95}
      priority={isHero}
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
