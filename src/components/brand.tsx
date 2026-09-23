import Image from "next/image";
import { cn } from "@/lib/utils";

/** Helmet Orbit mark — cream squircle, charcoal helmet + orbital ring. */
export function BrandMark({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <Image
      src="/icons/icon-192.png"
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
