import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: number;
  /**
   * `app` — chrome mark (nav / wordmark).
   * `hero` — larger landing mark. Both use the same crisp SVG.
   */
  variant?: "app" | "hero";
};

/** Helmet Orbit mark — vector SVG, cream on transparent for charcoal UI. */
export function BrandMark({
  className,
  size = 36,
  variant: _variant = "app",
}: BrandMarkProps) {
  // True vector at any display size (no PNG upscale). Query busts old raster caches.
  const src = `/icons/helmet-orbit-mark.svg?v=vector-1`;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG mark; avoid next/image rasterization
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      className={cn("shrink-0", className)}
      aria-hidden
      draggable={false}
      decoding="async"
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
