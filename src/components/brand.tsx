import { cn } from "@/lib/utils";

/** Inline Badge Ball mark — cream squircle, forest shield + football. */
export function BrandMark({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      <rect width="512" height="512" rx="112" fill="#FDF9F0" />
      <path
        fill="#1B3022"
        d="M150 82 H362 L400 120 V280 Q400 360 256 440 Q112 360 112 280 V120 Z"
      />
      <path
        fill="#FDF9F0"
        d="M168 108 H344 L372 134 V274 Q372 340 256 408 Q140 340 140 274 V134 Z"
      />
      <ellipse cx="256" cy="214" rx="98" ry="46" fill="#1B3022" />
      <rect x="212" y="208" width="88" height="14" rx="7" fill="#FDF9F0" />
      <rect x="224" y="192" width="10" height="46" rx="5" fill="#FDF9F0" />
      <rect x="241" y="192" width="10" height="46" rx="5" fill="#FDF9F0" />
      <rect x="258" y="192" width="10" height="46" rx="5" fill="#FDF9F0" />
      <rect x="275" y="192" width="10" height="46" rx="5" fill="#FDF9F0" />
      <rect x="292" y="192" width="10" height="46" rx="5" fill="#FDF9F0" />
    </svg>
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
