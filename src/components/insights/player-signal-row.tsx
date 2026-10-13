"use client";

import { useState } from "react";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";
import { PositionChip } from "@/components/position-chip";
import {
  WeekPointsStrip,
} from "@/components/insights/week-points-strip";
import type {
  PlayerSignal,
  RuleChip,
  UsageMetric,
} from "@/lib/insights/roster-signals";
import { dashNull } from "@/lib/insights/format-null";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import type { DvpChip } from "@/lib/insights/defense-vs-position";

function trendTone(label: PlayerSignal["trend"]["label"]): string {
  switch (label) {
    case "Rising":
      return "border-success/40 text-success";
    case "Fading":
      return "border-warning/40 text-warning";
    case "Thin":
      return "border-emerald-950/20 text-emerald-950/45";
    default:
      return "border-info/35 text-info";
  }
}

function dvpTone(tier: DvpChip["tier"]): string {
  if (tier === "soft") return "border-success/40 text-success";
  if (tier === "tough") return "border-danger/40 text-danger";
  if (tier === "avg") return "border-warning/40 text-warning";
  return "border-emerald-950/20 text-emerald-950/45";
}

function statusChip(status: PlayerSignal["status"]): {
  show: boolean;
  code: string;
  className: string;
} {
  const code = formatStatusCode(status);
  if (code === "ACTIVE" || code === "UNKNOWN") {
    return { show: false, code, className: "" };
  }
  const short =
    code === "QUESTIONABLE"
      ? "Q"
      : code === "DOUBTFUL"
        ? "D"
        : code === "OUT"
          ? "O"
          : code === "IR"
            ? "IR"
            : code === "SUSPENSION"
              ? "SUS"
              : code;
  return { show: true, code: short, className: statusColor(status) };
}

function UsageMini({ metrics }: { metrics: UsageMetric[] }) {
  const shown = metrics.filter(
    (m) => m.last3 != null || m.season != null,
  );
  if (!shown.length) {
    return (
      <p className="text-[10px] text-emerald-950/35">Usage unknown</p>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((m) => (
        <p
          key={m.key}
          className="text-[10px] leading-snug text-emerald-950/70"
          title={m.label}
        >
          {m.impactLine}
        </p>
      ))}
    </div>
  );
}

function RuleChipButton({
  chip,
  active,
  onToggle,
}: {
  chip: RuleChip;
  active: boolean;
  onToggle: () => void;
}) {
  const tone =
    chip.tone === "good"
      ? "border-success/40 text-success"
      : chip.tone === "bad"
        ? "border-danger/40 text-danger"
        : chip.tone === "warn"
          ? "border-warning/40 text-warning"
          : "border-info/40 text-info";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={chip.detail}
      className={cn(
        "max-w-full rounded border px-1.5 py-0.5 text-left text-[10px] font-semibold leading-snug",
        tone,
        active && "bg-white/5",
      )}
    >
      {chip.label}
    </button>
  );
}

function formLine(signal: PlayerSignal): string {
  const t = signal.trend;
  if (t.avg3 == null || t.seasonAvg == null) {
    return "Not enough completed games to compare form";
  }
  const dir =
    t.pctDelta == null
      ? "holding steady"
      : t.pctDelta >= 0.15
        ? "trending up"
        : t.pctDelta <= -0.15
          ? "trending down"
          : "holding steady";
  return `Last 3 games avg ${t.avg3.toFixed(1)} vs season ${t.seasonAvg.toFixed(1)}: ${dir}`;
}

export function PlayerSignalRow({
  signal,
  maxPts,
}: {
  signal: PlayerSignal;
  maxPts: number;
}) {
  const [openChip, setOpenChip] = useState<string | null>(null);
  const status = statusChip(signal.status);
  const t = signal.trend;
  const detail = signal.ruleChips.find((c) => c.id === openChip);

  return (
    <article className="border-b border-emerald-950/10 px-3 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PositionChip position={signal.player.position} />
            <h3 className="truncate text-sm font-semibold text-emerald-950">
              {formatPlayerLabel(
                signal.player.name,
                signal.player.nflTeam,
              )}
            </h3>
            {status.show && (
              <span
                className={cn(
                  "rounded px-1 py-px text-[9px] font-bold uppercase",
                  status.className,
                )}
              >
                {status.code}
              </span>
            )}
            {signal.byeThisWeek && (
              <span className="rounded border border-info/35 px-1 py-px text-[9px] font-bold uppercase text-info">
                Bye
              </span>
            )}
          </div>
          <p
            className={cn(
              "mt-1 inline-flex max-w-full rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-snug",
              trendTone(t.label),
            )}
            title={t.reason}
          >
            {t.reason}
          </p>
          <p className="mt-1 text-[11px] text-emerald-950/55">
            {signal.player.isStarter ? "In your starting lineup" : "On your bench"}
            {" · "}
            {formLine(signal)}
          </p>
        </div>

        <div className="flex max-w-[14rem] flex-col items-end gap-1 sm:max-w-[18rem]">
          {signal.matchup ? (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-right text-[10px] font-semibold leading-snug",
                dvpTone(signal.matchup.tier),
              )}
              title={signal.matchup.label}
            >
              {signal.matchup.label}
            </span>
          ) : signal.byeThisWeek ? (
            <span className="rounded border border-info/35 px-1.5 py-0.5 text-[10px] font-semibold text-info">
              On bye: scores 0 this week
            </span>
          ) : signal.player.opponent ? (
            <span className="rounded border border-emerald-950/20 px-1.5 py-0.5 text-[10px] text-emerald-950/55">
              {signal.player.opponent}: matchup rank unknown
            </span>
          ) : (
            <span className="rounded border border-emerald-950/15 px-1.5 py-0.5 text-[10px] text-emerald-950/35">
              Opponent TBD
            </span>
          )}
          <span className="text-[10px] tabular-nums text-[#C026FF]">
            {signal.sleeperProj != null
              ? `Projected ${dashNull(signal.sleeperProj)} this week (Sleeper)`
              : "Projected — this week (Sleeper)"}
          </span>
        </div>
      </div>

      <div className="mt-2.5 overflow-x-auto">
        <WeekPointsStrip weeks={signal.weeks} maxPts={maxPts} />
      </div>

      <div className="mt-2.5">
        <UsageMini metrics={signal.usage} />
      </div>

      {signal.ruleChips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {signal.ruleChips.map((chip) => (
            <RuleChipButton
              key={chip.id}
              chip={chip}
              active={openChip === chip.id}
              onToggle={() =>
                setOpenChip((id) => (id === chip.id ? null : chip.id))
              }
            />
          ))}
          {detail && (
            <span className="basis-full text-[10px] leading-snug text-emerald-950/60">
              {detail.detail}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
