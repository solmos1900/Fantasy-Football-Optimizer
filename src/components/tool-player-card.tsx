"use client";

import { useState, type ReactNode } from "react";
import { cn, statusColor } from "@/lib/utils";
import { PositionChip } from "@/components/position-chip";
import { WeekPointsStrip } from "@/components/insights/week-points-strip";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import {
  buildToolPlayerCard,
  type ToolDisplayMeta,
} from "@/lib/insights/tool-display";
import type { FantasyPlayer } from "@/lib/types";
import type { TeammateInjuryImpact } from "@/lib/insights/teammate-injury";
import type { DvpChip } from "@/lib/insights/defense-vs-position";

function dvpTone(tier: DvpChip["tier"]): string {
  if (tier === "soft") return "border-success/40 text-success";
  if (tier === "tough") return "border-danger/40 text-danger";
  if (tier === "avg") return "border-warning/40 text-warning";
  return "border-emerald-950/20 text-emerald-950/45";
}

/**
 * Insights-parity player panel for Trade Analyzer / Who to Start:
 * full name + team, week PPR strip, labeled Sleeper proj, DVP matchup,
 * injury + teammate-injury tags.
 */
export function ToolPlayerCard({
  player,
  toolMeta,
  teammateImpacts = [],
  maxPts,
  compact = false,
  trailing,
}: {
  player: FantasyPlayer;
  toolMeta?: ToolDisplayMeta | null;
  teammateImpacts?: TeammateInjuryImpact[];
  maxPts?: number;
  compact?: boolean;
  trailing?: ReactNode;
}) {
  const [openImpact, setOpenImpact] = useState<string | null>(null);
  const card = buildToolPlayerCard(player, toolMeta, teammateImpacts);
  const scale = Math.max(maxPts ?? toolMeta?.maxPts ?? 1, 1);
  const detail = teammateImpacts.find(
    (i) => `${i.teammateEspnId}` === openImpact,
  );

  return (
    <div className={cn("min-w-0", !compact && "space-y-2")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PositionChip position={player.position} />
            <p className="truncate text-sm font-semibold text-emerald-950">
              {card.label}
            </p>
            {card.injuryTag && (
              <span
                className={cn(
                  "rounded px-1 py-px text-[9px] font-bold uppercase",
                  statusColor(player.injuryStatus),
                )}
              >
                {card.injuryTag}
              </span>
            )}
            {card.byeThisWeek && (
              <span className="rounded border border-info/35 px-1 py-px text-[9px] font-bold uppercase text-info">
                Bye
              </span>
            )}
          </div>
          {card.formLine && (
            <p className="mt-1 text-[11px] text-emerald-950/55">{card.formLine}</p>
          )}
        </div>
        <div className="flex max-w-[14rem] flex-col items-end gap-1 sm:max-w-[18rem]">
          {card.matchup ? (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-right text-[10px] font-semibold leading-snug",
                dvpTone(card.matchup.tier),
              )}
              title={card.matchup.label}
            >
              {card.matchup.label}
            </span>
          ) : card.byeThisWeek ? (
            <span className="rounded border border-info/35 px-1.5 py-0.5 text-[10px] font-semibold text-info">
              On bye: scores 0 this week
            </span>
          ) : player.opponent ? (
            <span className="rounded border border-emerald-950/20 px-1.5 py-0.5 text-[10px] text-emerald-950/55">
              {player.opponent}: matchup rank unknown
            </span>
          ) : (
            <span className="rounded border border-emerald-950/15 px-1.5 py-0.5 text-[10px] text-emerald-950/35">
              Opponent TBD
            </span>
          )}
          <span className="text-[10px] tabular-nums text-[#C026FF]">
            {card.sleeperLine}
          </span>
          {trailing}
        </div>
      </div>

      {!compact && card.weeks.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <WeekPointsStrip weeks={card.weeks} maxPts={scale} />
        </div>
      )}

      {teammateImpacts.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {teammateImpacts.map((imp) => {
            const key = String(imp.teammateEspnId);
            const who = formatPlayerLabel(player.name, player.nflTeam);
            return (
              <button
                key={key}
                type="button"
                title={imp.detail}
                onClick={() =>
                  setOpenImpact((k) => (k === key ? null : key))
                }
                className={cn(
                  "max-w-full rounded border px-1.5 py-0.5 text-left text-[10px] font-semibold leading-snug",
                  imp.tone === "good" && "border-success/40 text-success",
                  imp.tone === "warn" && "border-warning/40 text-warning",
                  imp.tone === "bad" && "border-danger/40 text-danger",
                  imp.tone === "info" && "border-info/40 text-info",
                )}
              >
                {who}: {imp.label}
              </button>
            );
          })}
          {detail && (
            <span className="basis-full text-[10px] leading-snug text-emerald-950/60">
              {detail.detail}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
