import type { PlayerTrendLabel } from "@/lib/types";

/** Research brief labels: Rising | Stable | Fading | BoomBust | InjuryRisk (+ Thin). */
export function trendLabelCopy(label: PlayerTrendLabel): string {
  switch (label) {
    case "Rising":
      return "Rising";
    case "Fading":
      return "Fading";
    case "BoomBust":
      return "Boom-bust";
    case "InjuryRisk":
      return "Injury risk";
    case "Stable":
      return "Stable";
    case "Thin":
      return "Thin sample";
    // Legacy aliases from first iteration
    case "hot":
    case "rising":
      return "Rising";
    case "cold":
    case "falling":
      return "Fading";
    case "boom":
    case "bust":
      return "Boom-bust";
    case "steady":
      return "Stable";
    case "thin":
      return "Thin sample";
    default:
      return String(label);
  }
}

export function normalizeTrendLabel(raw: string): PlayerTrendLabel {
  switch (raw) {
    case "Rising":
    case "rising":
    case "hot":
      return "Rising";
    case "Fading":
    case "falling":
    case "cold":
      return "Fading";
    case "BoomBust":
    case "boom":
    case "bust":
      return "BoomBust";
    case "InjuryRisk":
      return "InjuryRisk";
    case "Thin":
    case "thin":
      return "Thin";
    case "Stable":
    case "steady":
    default:
      return "Stable";
  }
}
