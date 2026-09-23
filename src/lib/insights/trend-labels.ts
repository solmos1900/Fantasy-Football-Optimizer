import type { PlayerTrendLabel } from "@/lib/types";

export function trendLabelCopy(label: PlayerTrendLabel): string {
  switch (label) {
    case "hot":
      return "Hot";
    case "cold":
      return "Cold";
    case "boom":
      return "Beating proj";
    case "bust":
      return "Under proj";
    case "rising":
      return "Rising";
    case "falling":
      return "Falling";
    case "steady":
      return "Steady";
    case "thin":
      return "Thin sample";
  }
}
