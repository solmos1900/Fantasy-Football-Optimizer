import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatRecord(wins: number, losses: number, ties: number) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function statusColor(status: string) {
  switch (status) {
    case "QUESTIONABLE":
      return "text-amber-700 bg-amber-100";
    case "DOUBTFUL":
      return "text-orange-800 bg-orange-100";
    case "OUT":
    case "IR":
    case "SUSPENSION":
      return "text-red-800 bg-red-100";
    default:
      return "text-emerald-800 bg-emerald-100";
  }
}

export function priorityColor(priority: string) {
  switch (priority) {
    case "high":
      return "border-l-orange-500 bg-orange-50/80";
    case "medium":
      return "border-l-amber-400 bg-amber-50/50";
    default:
      return "border-l-stone-300 bg-stone-50/80";
  }
}
