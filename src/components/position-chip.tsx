import { cn, formatStatusCode } from "@/lib/utils";

/** Display label for roster/position codes (D/ST → DEF). */
export function formatPositionLabel(position: string): string {
  const code = formatStatusCode(position);
  if (code === "D/ST" || code === "DST") return "DEF";
  return code;
}

/** CSS modifier for `.pos-chip--*` — locked Team palette, app-wide. */
export function positionChipModifier(position: string): string {
  const code = formatStatusCode(position);
  switch (code) {
    case "QB":
      return "qb";
    case "RB":
      return "rb";
    case "WR":
      return "wr";
    case "TE":
      return "te";
    case "FLEX":
      return "flex";
    case "K":
      return "k";
    case "D/ST":
    case "DST":
      return "def";
    case "BN":
      return "bn";
    case "IR":
      return "ir";
    default:
      return "default";
  }
}

export function positionChipClassName(position: string, className?: string) {
  return cn("pos-chip", `pos-chip--${positionChipModifier(position)}`, className);
}

/**
 * App-wide position / lineup-slot chip (Sanity wash).
 * Use for QB·RB·WR·TE·FLEX·DEF·K (and BN/IR when showing roster slots).
 */
export function PositionChip({
  position,
  className,
}: {
  position: string;
  className?: string;
}) {
  return (
    <span className={positionChipClassName(position, className)}>
      {formatPositionLabel(position)}
    </span>
  );
}
