import { cn } from "@/lib/utils";
import type { PlayerTrendLabel, PlayerTrendView } from "@/lib/types";
import {
  humanTrendSentence,
  trendLabelCopy,
} from "@/lib/insights/trend-labels";
import { PlayerChip } from "@/components/insight-rich-text";

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

/** Shared window: early season shows full 1..current; later seasons keep last 5 for mobile. */
export function visibleTrendWeeks<
  T extends { week: number },
>(weeks: T[] | null | undefined): T[] {
  if (!weeks?.length) return [];
  return [...weeks].sort((a, b) => a.week - b.week).slice(-5);
}

/** Proj vs actual by week — horizontal bars with values (readable on mobile cards). */
export function ProjectionSpark({
  weeks,
  className,
}: {
  weeks: { week: number; projected: number | null; actual: number | null }[];
  className?: string;
}) {
  const rows = visibleTrendWeeks(weeks);
  if (!rows.length) return null;

  const max = Math.max(
    1,
    ...rows.flatMap((w) => [w.projected ?? 0, w.actual ?? 0]),
  );

  const pct = (value: number | null) =>
    value == null ? 0 : Math.max(value > 0 ? 6 : 0, (value / max) * 100);

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-emerald-950/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2.5 rounded-sm bg-emerald-950/30" aria-hidden />
          Projected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2.5 rounded-sm bg-orange-700" aria-hidden />
          Scored
        </span>
      </div>
      <div className="space-y-2" role="img" aria-label="Projected versus actual points by week">
        {rows.map((w) => {
          const pending = w.actual == null;
          return (
            <div key={w.week} className="grid grid-cols-[2.25rem_1fr] gap-x-2 gap-y-1 items-center">
              <span className="type-stat text-base leading-none text-emerald-950">
                W{w.week}
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-emerald-950/8">
                    {w.projected != null ? (
                      <div
                        className="h-full rounded-sm bg-emerald-950/35"
                        style={{ width: `${pct(w.projected)}%` }}
                      />
                    ) : (
                      <div className="h-full w-full rounded-sm border border-dashed border-emerald-950/20" />
                    )}
                  </div>
                  <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-emerald-950/70">
                    {w.projected != null ? w.projected.toFixed(1) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-orange-700/10">
                    {w.actual != null ? (
                      <div
                        className="h-full rounded-sm bg-orange-700"
                        style={{ width: `${pct(w.actual)}%` }}
                      />
                    ) : (
                      <div
                        className="h-full w-full rounded-sm border border-dashed border-orange-700/35"
                        title={pending ? "Game not finished" : undefined}
                      />
                    )}
                  </div>
                  <span
                    className={cn(
                      "w-9 shrink-0 text-right text-[11px] tabular-nums font-medium",
                      w.actual != null ? "text-emerald-950" : "text-emerald-950/40",
                    )}
                  >
                    {w.actual != null ? w.actual.toFixed(1) : "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
        "rounded px-1.5 py-0.5 text-[11px] font-semibold",
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
        No weekly scores yet — sync the league to start building history.
      </p>
    );
  }

  const takeaway = humanTrendSentence(trend);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {trend.playerName && <PlayerChip name={trend.playerName} />}
        <TrendBadge label={trend.trendLabel} />
        <span className="text-xs text-emerald-950/45">
          Last {trend.weeksSampled} game{trend.weeksSampled === 1 ? "" : "s"}
        </span>
      </div>
      {!compact && (
        <p className="text-sm font-medium leading-relaxed text-emerald-950">
          {takeaway}
        </p>
      )}
      <ProjectionSpark weeks={trend.weeks ?? []} />
      {!compact && (trend.weeks?.length ?? 0) > 0 && (
        <details className="border-t border-emerald-950/10 pt-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-emerald-950/45 hover:text-emerald-950/70">
            Week-by-week scores
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[16rem] text-left text-sm">
              <thead>
                <tr className="border-b border-emerald-950/10 text-xs uppercase tracking-wider text-emerald-950/45">
                  <th className="py-1.5 pr-2 font-semibold">Week</th>
                  <th className="py-1.5 pr-2 font-semibold">Projected</th>
                  <th className="py-1.5 pr-2 font-semibold">Scored</th>
                  <th className="py-1.5 font-semibold">Diff</th>
                </tr>
              </thead>
              <tbody>
                {[...visibleTrendWeeks(trend.weeks)]
                  .sort((a, b) => b.week - a.week)
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
              Top bar = projected · bottom bar = actual points scored.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
