import { cn } from "@/lib/utils";
import type { PlayerTrendLabel, PlayerTrendView } from "@/lib/types";
import { trendLabelCopy } from "@/lib/insights/trend-labels";

function labelTone(label: PlayerTrendLabel): string {
  const n =
    label === "Rising" || label === "rising" || label === "hot"
      ? "Rising"
      : label === "Fading" || label === "falling" || label === "cold"
        ? "Fading"
        : label === "BoomBust" || label === "boom" || label === "bust"
          ? "BoomBust"
          : label === "InjuryRisk"
            ? "InjuryRisk"
            : label === "Thin" || label === "thin"
              ? "Thin"
              : "Stable";
  switch (n) {
    case "Rising":
      return "bg-emerald-700 text-white";
    case "Fading":
    case "InjuryRisk":
      return "bg-orange-700 text-white";
    case "BoomBust":
      return "bg-amber-700 text-white";
    case "Thin":
      return "bg-emerald-950/10 text-emerald-950/60";
    default:
      return "bg-emerald-950/15 text-emerald-950";
  }
}

/** Compact proj vs actual bars for recent weeks (CSS only — no chart lib). */
export function ProjectionSpark({
  weeks,
  className,
}: {
  weeks: { week: number; projected: number | null; actual: number | null }[];
  className?: string;
}) {
  const rows = [...weeks]
    .filter((w) => w.projected != null || w.actual != null)
    .sort((a, b) => a.week - b.week)
    .slice(-5);
  if (!rows.length) return null;

  const max = Math.max(
    1,
    ...rows.flatMap((w) => [w.projected ?? 0, w.actual ?? 0]),
  );

  return (
    <div className={cn("flex items-end gap-2", className)} aria-hidden>
      {rows.map((w) => {
        const projH = ((w.projected ?? 0) / max) * 100;
        const actH = ((w.actual ?? 0) / max) * 100;
        return (
          <div key={w.week} className="flex w-8 flex-col items-center gap-1">
            <div className="flex h-14 w-full items-end justify-center gap-0.5">
              <div
                className="w-1.5 rounded-sm bg-emerald-950/25"
                style={{ height: `${Math.max(4, projH)}%` }}
                title={
                  w.projected != null ? `Proj ${w.projected.toFixed(1)}` : "No proj"
                }
              />
              <div
                className="w-1.5 rounded-sm bg-orange-600"
                style={{ height: `${Math.max(4, actH)}%` }}
                title={
                  w.actual != null ? `Actual ${w.actual.toFixed(1)}` : "No actual"
                }
              />
            </div>
            <span className="text-[10px] text-emerald-950/45">W{w.week}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TrendBadge({
  label,
  className,
}: {
  label: PlayerTrendLabel;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        labelTone(label),
        className,
      )}
    >
      {trendLabelCopy(label)}
    </span>
  );
}

export function TrendPanel({
  trend,
  compact = false,
}: {
  trend: PlayerTrendView | null | undefined;
  compact?: boolean;
}) {
  if (!trend) {
    return (
      <p className="text-sm text-emerald-950/50">
        No stored projection history yet — sync the league to start accumulating
        weekly snapshots.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TrendBadge label={trend.trendLabel} />
        {trend.usageTrend !== "unknown" && (
          <span className="text-xs text-emerald-950/55">
            Form slope: {trend.usageTrend}
          </span>
        )}
        <span className="text-xs text-emerald-950/45">
          {trend.weeksSampled} week{trend.weeksSampled === 1 ? "" : "s"} sampled
        </span>
      </div>
      {!compact && (
        <p className="text-sm leading-relaxed text-emerald-950/75">
          {trend.rationale}
        </p>
      )}
      <ProjectionSpark weeks={trend.weeks} />
      {!compact && trend.weeks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[16rem] text-left text-sm">
            <thead>
              <tr className="border-b border-emerald-950/10 text-xs uppercase tracking-wider text-emerald-950/45">
                <th className="py-1.5 pr-2 font-semibold">Week</th>
                <th className="py-1.5 pr-2 font-semibold">Proj</th>
                <th className="py-1.5 pr-2 font-semibold">Actual</th>
                <th className="py-1.5 font-semibold">Δ</th>
              </tr>
            </thead>
            <tbody>
              {[...trend.weeks]
                .sort((a, b) => b.week - a.week)
                .slice(0, 6)
                .map((w) => {
                  const delta =
                    w.projected != null && w.actual != null
                      ? w.actual - w.projected
                      : null;
                  return (
                    <tr key={w.week} className="border-b border-emerald-950/5">
                      <td className="type-stat py-1.5 pr-2 text-lg">
                        {w.week}
                      </td>
                      <td className="py-1.5 pr-2 text-emerald-950/70">
                        {w.projected != null ? w.projected.toFixed(1) : "—"}
                      </td>
                      <td className="py-1.5 pr-2 font-medium">
                        {w.actual != null ? w.actual.toFixed(1) : "—"}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 font-medium",
                          delta != null && delta >= 0
                            ? "text-emerald-700"
                            : delta != null
                              ? "text-orange-700"
                              : "text-emerald-950/40",
                        )}
                      >
                        {delta != null
                          ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-emerald-950/45">
            Gray bars = stored projection · orange = actual PPR. Sources: ESPN
            Fantasy league scoring or demo seed (heuristic fills only when marked
            in DB) — not a paid ranking site.
          </p>
        </div>
      )}
    </div>
  );
}
