import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatRecord(wins: number, losses: number, ties: number) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/** Always-uppercase roster/injury codes for badges and slot labels (e.g. IR, OUT). */
export function formatStatusCode(status: string): string {
  return status.trim().toUpperCase();
}

/**
 * Copula + injury for sentences like "Player ___."
 * IR → "is on the IR" (never "is IR" / "is ir").
 * Other statuses: "is OUT" (code) or "is out" (prose).
 */
export function injuryIsPhrase(
  status: string,
  style: "code" | "prose" = "code",
): string {
  const code = formatStatusCode(status);
  if (code === "IR") return "is on the IR";
  if (style === "prose") return `is ${code.toLowerCase()}`;
  return `is ${code}`;
}

/**
 * Standalone injury phrasing for headlines / evidence.
 * IR → "on the IR"; others stay uppercase codes (or lowercase prose).
 */
export function injuryStatusPhrase(
  status: string,
  style: "code" | "prose" | "listed" = "code",
): string {
  const code = formatStatusCode(status);
  if (code === "IR") return "on the IR";
  if (style === "prose") return code.toLowerCase();
  if (style === "listed") return `listed ${code}`;
  return code;
}

export function statusColor(status: string) {
  switch (formatStatusCode(status)) {
    case "QUESTIONABLE":
      return "text-amber-300 bg-amber-950/50";
    case "DOUBTFUL":
      return "text-orange-700 bg-orange-50";
    case "OUT":
    case "IR":
    case "SUSPENSION":
      return "text-red-300 bg-red-950/50";
    default:
      return "text-emerald-800 bg-emerald-100";
  }
}

export function priorityColor(priority: string) {
  switch (priority) {
    case "high":
      return "border-l-orange-500 bg-orange-50/80";
    case "medium":
      return "border-l-amber-400 bg-amber-950/40";
    default:
      return "border-l-emerald-950/25 bg-emerald-50/80";
  }
}
