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
import { dashNull, dashSharePct } from "@/lib/insights/format-null";
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

function DeltaArrow({ delta, asPct }: { delta: number | null; asPct: boolean }) {
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 1e-9) {
    return <span className="text-emerald-950/30">·</span>;
  }
  const up = delta > 0;
  const label = asPct
    ? `${up ? "+" : ""}${(delta * 100).toFixed(0)}`
    : `${up ? "+" : ""}${delta.toFixed(1)}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums",
        up ? "text-success" : "text-danger",
      )}
    >
      {up ? "↑" : "↓"}
      {label}
    </span>
  );
}

function UsageMini({ metrics }: { metrics: UsageMetric[] }) {
  const shown = metrics.filter(
    (m) => m.last3 != null || m.season != null,
  );
  if (!shown.length) {
    return (
      <p className="text-[10px] text-emerald-950/35">Usage —</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {shown.map((m) => (
        <div key={m.key} className="flex items-center gap-1 text-[10px]">
          <span className="font-semibold uppercase tracking-wide text-emerald-950/40">
            {m.label}
          </span>
          <span className="tabular-nums text-emerald-950/85">
            {m.asPct ? dashSharePct(m.last3, 0) : dashNull(m.last3, 1)}
          </span>
          <span className="text-emerald-950/30">/</span>
          <span className="tabular-nums text-emerald-950/50">
            {m.asPct ? dashSharePct(m.season, 0) : dashNull(m.season, 1)}
          </span>
          <DeltaArrow delta={m.delta} asPct={m.asPct} />
        </div>
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
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
        tone,
        active && "bg-white/5",
      )}
    >
      {chip.label}
    </button>
  );
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
              {signal.player.name}
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
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                trendTone(t.label),
              )}
            >
              {t.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-emerald-950/45">
            {signal.player.nflTeam}
            {signal.player.isStarter ? " · START" : " · BN"}
            {" · "}
            3wk {dashNull(t.avg3)} · szn {dashNull(t.seasonAvg)}
            {t.pctDelta != null
              ? ` · ${t.pctDelta >= 0 ? "+" : ""}${(t.pctDelta * 100).toFixed(0)}%`
              : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          {signal.matchup ? (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                dvpTone(signal.matchup.tier),
              )}
            >
              {signal.matchup.label}
            </span>
          ) : (
            <span className="rounded border border-emerald-950/15 px-1.5 py-0.5 text-[10px] text-emerald-950/35">
              vs — · —
            </span>
          )}
          <span className="text-[10px] tabular-nums text-[#C026FF]">
            Proj {dashNull(signal.sleeperProj)}
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
            <span className="text-[10px] tabular-nums text-emerald-950/55">
              {detail.detail}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
