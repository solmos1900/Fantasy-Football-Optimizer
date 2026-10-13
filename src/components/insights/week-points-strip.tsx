"use client";

import { cn } from "@/lib/utils";
import type { WeekPointCell } from "@/lib/insights/roster-signals";
import { dashNull } from "@/lib/insights/format-null";

/**
 * Module A — identical week axis for every player.
 * Played weeks = solid bars; current Proj (Sleeper) = purple outline + hatch;
 * BYE / DNP / empty (snaps but null PPR) = labeled gaps (never fake 0 bars).
 */
export function WeekPointsStrip({
  weeks,
  maxPts,
  className,
}: {
  weeks: WeekPointCell[];
  /** Shared scale across the roster so bars are comparable. */
  maxPts: number;
  className?: string;
}) {
  const scale = Math.max(maxPts, 1);

  return (
    <div
      className={cn("flex items-end gap-1", className)}
      role="img"
      aria-label="Weekly PPR points"
    >
      {weeks.map((cell) => {
        const isProj = cell.kind === "proj";
        const hasBar =
          (cell.kind === "played" || cell.kind === "proj") &&
          cell.value != null;
        const h = hasBar
          ? Math.max(4, Math.round((Math.max(cell.value!, 0) / scale) * 36))
          : 0;

        return (
          <div
            key={cell.week}
            className="flex w-7 flex-col items-center gap-0.5 sm:w-8"
          >
            <div className="flex h-9 w-full items-end justify-center">
              {cell.kind === "bye" ? (
                <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-950/35">
                  BYE
                </span>
              ) : cell.kind === "dnp" || cell.kind === "empty" ? (
                <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-950/30">
                  {cell.kind === "dnp" ? "DNP" : "—"}
                </span>
              ) : hasBar ? (
                <div
                  className={cn(
                    "w-full max-w-[1.35rem] rounded-sm",
                    isProj
                      ? "border border-[#C026FF] bg-[repeating-linear-gradient(-45deg,transparent,transparent_2px,rgba(192,38,255,0.35)_2px,rgba(192,38,255,0.35)_4px)]"
                      : "bg-[#C026FF]/70",
                  )}
                  style={{ height: h }}
                  title={
                    isProj
                      ? `Proj (Sleeper) ${dashNull(cell.value)}`
                      : `W${cell.week} ${dashNull(cell.value)}`
                  }
                />
              ) : isProj ? (
                <div
                  className="flex h-9 w-full max-w-[1.35rem] items-center justify-center rounded-sm border border-dashed border-[#C026FF]/55"
                  title="Proj (Sleeper) —"
                >
                  <span className="text-[9px] text-[#C026FF]/80">—</span>
                </div>
              ) : (
                <span className="text-[9px] text-emerald-950/30">—</span>
              )}
            </div>
            <span
              className={cn(
                "text-[9px] font-semibold tabular-nums",
                isProj ? "text-[#C026FF]" : "text-emerald-950/45",
              )}
            >
              {isProj ? "P" : `W${cell.week}`}
            </span>
            <span
              className={cn(
                "text-[10px] tabular-nums leading-none",
                isProj ? "text-[#C026FF]" : "text-emerald-950/80",
              )}
            >
              {cell.kind === "bye" || cell.kind === "dnp"
                ? ""
                : dashNull(cell.value, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WeekAxisLegend({ weekAxis }: { weekAxis: number[] }) {
  const last = weekAxis[weekAxis.length - 1];
  return (
    <p className="text-[10px] text-emerald-950/40">
      Axis W1–W{last}
      {last != null ? " · " : ""}
      <span className="text-[#C026FF]">P</span> = Proj (Sleeper) · BYE/DNP/— ≠ 0
    </p>
  );
}
