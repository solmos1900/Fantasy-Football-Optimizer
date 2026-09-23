import type { PlayerTrendLabel, PlayerTrendView } from "@/lib/types";

/** Self-explanatory chip / badge phrases — never bare "Stable". */
export function trendLabelCopy(label: PlayerTrendLabel): string {
  switch (label) {
    case "Rising":
    case "rising":
    case "hot":
      return "Heating up";
    case "Fading":
    case "falling":
    case "cold":
      return "Cooling off";
    case "BoomBust":
    case "boom":
    case "bust":
      return "Boom or bust";
    case "InjuryRisk":
      return "Injury watch";
    case "Thin":
    case "thin":
      return "Not enough games yet";
    case "Stable":
    case "steady":
    default:
      return "Scoring steady";
  }
}

/** One plain-English sentence for an insight card (no internals). */
export function humanTrendSentence(trend: PlayerTrendView): string {
  const name = trend.playerName;
  const scored = [...trend.weeks]
    .filter((w) => w.actual != null)
    .sort((a, b) => b.week - a.week)
    .slice(0, 3);
  const avg = trend.recentFormAvg;
  const scores =
    scored.length > 0
      ? scored.map((w) => w.actual!.toFixed(1)).join(", ")
      : null;

  switch (
    trend.trendLabel === "rising" ||
    trend.trendLabel === "hot" ||
    trend.trendLabel === "Rising"
      ? "Rising"
      : trend.trendLabel === "falling" ||
          trend.trendLabel === "cold" ||
          trend.trendLabel === "Fading"
        ? "Fading"
        : trend.trendLabel === "boom" ||
            trend.trendLabel === "bust" ||
            trend.trendLabel === "BoomBust"
          ? "BoomBust"
          : trend.trendLabel === "InjuryRisk"
            ? "InjuryRisk"
            : trend.trendLabel === "thin" || trend.trendLabel === "Thin"
              ? "Thin"
              : "Stable"
  ) {
    case "InjuryRisk":
      return `${name} is on the injury report — sit or have a backup ready until the status clears.`;
    case "Thin":
      return avg != null
        ? `${name} only has a short sample so far (about ${avg.toFixed(1)} points recently) — lean on this week's projection more than the trend.`
        : `${name} does not have enough recent games yet — lean on this week's projection.`;
    case "Rising":
      return scores && avg != null
        ? `${name} is heating up — about ${avg.toFixed(1)} points over the last ${scored.length} games (${scores}). Lean into the start.`
        : `${name} is heating up versus recent weeks — lean into the start.`;
    case "Fading":
      return scores && avg != null
        ? `${name} is cooling off — about ${avg.toFixed(1)} points over the last ${scored.length} games (${scores}). Consider a safer option if you have one.`
        : `${name} is cooling off versus recent weeks — consider a safer option if you have one.`;
    case "BoomBust":
      return scores && avg != null
        ? `${name} has been boom-or-bust lately (about ${avg.toFixed(1)} average; recent scores ${scores}). Fine to start if you need upside — expect volatility.`
        : `${name} has been boom-or-bust lately — fine if you need upside, expect volatility.`;
    default:
      return scores && avg != null
        ? `${name} is averaging about ${avg.toFixed(1)} points over the last ${scored.length} games (${scores}). Scoring is steady — start with confidence.`
        : `${name}'s recent scoring looks steady — start with confidence if the projection is solid.`;
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
