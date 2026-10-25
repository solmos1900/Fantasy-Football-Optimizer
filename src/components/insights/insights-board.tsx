"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";
import { PositionChip } from "@/components/position-chip";
import { Button } from "@/components/ui/button";
import { PoolFreshnessBanner } from "@/components/pool-freshness-banner";
import { PlayerSignalRow } from "@/components/insights/player-signal-row";
import { WeekAxisLegend } from "@/components/insights/week-points-strip";
import type { InsightsSignalsBundle } from "@/lib/insights/roster-signals";
import { formatUpdatedHm } from "@/lib/insights/format-null";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import { sortByEspnRosterOrder } from "@/lib/roster-order";
import type { FantasyTeam } from "@/lib/types";

function PulseStrip({ pulse }: { pulse: InsightsSignalsBundle["pulse"] }) {
  const bits: { label: string; names: string; tone: string }[] = [];
  if (pulse.rising.length) {
    bits.push({
      label: "Trending up (more points lately)",
      names: pulse.rising
        .map((p) => formatPlayerLabel(p.name, p.nflTeam))
        .join(", "),
      tone: "text-success",
    });
  }
  if (pulse.fading.length) {
    bits.push({
      label: "Trending down (fewer points lately)",
      names: pulse.fading
        .map((p) => formatPlayerLabel(p.name, p.nflTeam))
        .join(", "),
      tone: "text-warning",
    });
  }
  if (pulse.atRisk.length) {
    bits.push({
      label: "Watch list",
      names: pulse.atRisk
        .map(
          (p) =>
            `${formatPlayerLabel(p.name, p.nflTeam)} (${p.reason})`,
        )
        .join(", "),
      tone: "text-danger",
    });
  }
  if (!bits.length) {
    return (
      <p className="text-[11px] text-emerald-950/40">
        No big roster swings this week
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-[11px]">
      {bits.map((b) => (
        <p key={b.label} className={cn("leading-snug", b.tone)}>
          <span className="font-bold">{b.label}:</span> {b.names}
        </p>
      ))}
    </div>
  );
}

/**
 * My roster — desktop centered dialog; mobile bottom sheet.
 * Dense rows only (no essay copy).
 */
function RosterDialog({
  you,
  open,
  onClose,
  sleeperByEspn,
}: {
  you: FantasyTeam;
  open: boolean;
  onClose: () => void;
  sleeperByEspn: Map<number, number | null>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const roster = sortByEspnRosterOrder(you.roster);
  const starters = roster.filter((p) => p.isStarter);
  const bench = roster.filter((p) => !p.isStarter && p.slot !== "IR");

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="insights-roster-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label="Close roster"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden border border-emerald-950/15 bg-[#1c1c1c]",
          "shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_10px_28px_-14px_rgba(0,0,0,0.45)]",
          "max-h-[min(85dvh,40rem)] rounded-t-2xl border-b-0",
          "sm:max-h-[min(80dvh,36rem)] sm:max-w-lg sm:rounded-2xl sm:border",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-emerald-950/15 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-950/10 px-4 py-3">
          <h2
            id="insights-roster-title"
            className="text-base font-semibold text-emerald-950"
          >
            My roster
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-950/15 text-emerald-950/55 hover:bg-emerald-950/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
            Starters
          </p>
          <ul className="divide-y divide-emerald-950/8">
            {starters.map((p) => {
              const out = ["OUT", "IR", "PUP", "DOUBTFUL", "SUSPENSION"].includes(
                p.injuryStatus,
              );
              const proj = sleeperByEspn.get(p.espnId);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 px-2 py-2"
                >
                  <PositionChip position={p.slot === "FLEX" ? "FLEX" : p.position} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-950">
                    {formatPlayerLabel(p.name, p.nflTeam)}
                  </span>
                  {p.injuryStatus !== "ACTIVE" && (
                    <span
                      className={cn(
                        "rounded px-1 text-[9px] font-bold",
                        statusColor(p.injuryStatus),
                      )}
                    >
                      {formatStatusCode(p.injuryStatus) === "QUESTIONABLE"
                        ? "Q"
                        : formatStatusCode(p.injuryStatus) === "DOUBTFUL"
                          ? "D"
                          : formatStatusCode(p.injuryStatus) === "OUT"
                            ? "O"
                            : formatStatusCode(p.injuryStatus)}
                    </span>
                  )}
                  <span
                    className={cn(
                      "type-stat w-10 text-right text-sm tabular-nums",
                      out ? "text-danger" : "text-[#C026FF]",
                    )}
                  >
                    {proj == null ? "—" : proj.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ul>
          {bench.length > 0 && (
            <>
              <p className="mt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
                Bench
              </p>
              <ul className="divide-y divide-emerald-950/8">
                {bench.map((p) => {
                  const proj = sleeperByEspn.get(p.espnId);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 px-2 py-2"
                    >
                      <PositionChip position={p.position} />
                      <span className="min-w-0 flex-1 truncate text-sm text-emerald-950/80">
                        {formatPlayerLabel(p.name, p.nflTeam)}
                      </span>
                      <span className="type-stat w-10 text-right text-sm tabular-nums text-[#C026FF]">
                        {proj == null ? "—" : proj.toFixed(1)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function InsightsBoard({
  you,
  bundle,
}: {
  you: FantasyTeam;
  bundle: InsightsSignalsBundle;
}) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const [openRosterChip, setOpenRosterChip] = useState<string | null>(null);

  const maxPts = useMemo(() => {
    let m = 1;
    for (const s of bundle.signals) {
      for (const w of s.weeks) {
        if (w.value != null && w.value > m) m = w.value;
      }
    }
    return m;
  }, [bundle.signals]);

  const sleeperByEspn = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const s of bundle.signals) {
      map.set(s.player.espnId, s.sleeperProj);
    }
    return map;
  }, [bundle.signals]);

  const rosterDetail = bundle.ruleChipsRoster.find(
    (c) => c.id === openRosterChip,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="type-page text-emerald-950">Insights</h1>
            <span className="text-[11px] text-emerald-950/45">
              Updated {formatUpdatedHm(bundle.updatedAt)}
            </span>
          </div>
          <PoolFreshnessBanner
            freshness={bundle.freshness}
            goldenCheck={bundle.goldenCheck}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setRosterOpen(true)}
        >
          My roster
        </Button>
      </div>

      <section className="rounded-xl border border-emerald-950/12 bg-[#1c1c1c] px-3 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
          Roster pulse
        </p>
        <PulseStrip pulse={bundle.pulse} />
        {bundle.ruleChipsRoster.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {bundle.ruleChipsRoster.map((chip) => (
              <button
                key={chip.id}
                type="button"
                title={chip.detail}
                onClick={() =>
                  setOpenRosterChip((id) =>
                    id === chip.id ? null : chip.id,
                  )
                }
                className={cn(
                  "max-w-full rounded border px-1.5 py-0.5 text-left text-[10px] font-semibold leading-snug",
                  chip.tone === "good" && "border-success/40 text-success",
                  chip.tone === "bad" && "border-danger/40 text-danger",
                  chip.tone === "warn" && "border-warning/40 text-warning",
                  chip.tone === "info" && "border-info/40 text-info",
                )}
              >
                {chip.label}
              </button>
            ))}
            {rosterDetail && (
              <span className="basis-full text-[10px] leading-snug text-emerald-950/55">
                {rosterDetail.detail}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-emerald-950/12 bg-[#1c1c1c]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-950/10 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
            Player signals
          </p>
          <WeekAxisLegend weekAxis={bundle.weekAxis} />
        </div>
        {bundle.signals.length === 0 ? (
          <p className="px-3 py-6 text-sm text-emerald-950/45">
            No roster players to score.
          </p>
        ) : (
          bundle.signals.map((s) => (
            <PlayerSignalRow
              key={s.player.id}
              signal={s}
              maxPts={maxPts}
            />
          ))
        )}
      </section>

      {bundle.waiverWatch.length > 0 && (
        <section className="rounded-xl border border-emerald-950/12 bg-[#1c1c1c] px-3 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
            Waiver watch · {bundle.waiverWatch[0]?.position}
          </p>
          <ul className="divide-y divide-emerald-950/8">
            {bundle.waiverWatch.map((w) => (
              <li
                key={w.player.id}
                className="flex items-center gap-2 py-2"
              >
                <PositionChip position={w.position} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-950">
                  {formatPlayerLabel(w.player.name, w.player.nflTeam)}
                </span>
                <span className="text-[10px] text-emerald-950/45">
                  {w.reason}
                </span>
                <span className="type-stat text-sm tabular-nums text-emerald-950">
                  {w.opportunity == null ? "—" : w.opportunity.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[10px] text-emerald-950/35">
        Points, injury, bye, usage, matchup rank, and weekly projection
      </p>

      <RosterDialog
        you={you}
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        sleeperByEspn={sleeperByEspn}
      />
    </div>
  );
}
