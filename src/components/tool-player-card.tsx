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
 * full name + team always visible (no truncate), week PPR strip,
 * labeled Sleeper proj, DVP matchup, injury + teammate-injury tags.
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
    <div className={cn("w-full space-y-2", compact && "space-y-1.5")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <PositionChip position={player.position} />
        <h3 className="max-w-full text-sm font-semibold leading-snug text-emerald-950 whitespace-normal break-words [overflow-wrap:anywhere]">
          {card.label}
        </h3>
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
        <p className="text-[11px] leading-snug text-emerald-950/55 break-words">
          {card.formLine}
        </p>
      )}

      <div className="flex flex-col items-start gap-1">
        {card.matchup ? (
          <span
            className={cn(
              "max-w-full rounded border px-1.5 py-0.5 text-left text-[10px] font-semibold leading-snug break-words",
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

      {!compact && card.weeks.length > 0 && (
        <div className="overflow-x-auto">
          <WeekPointsStrip weeks={card.weeks} maxPts={scale} />
        </div>
      )}

      {teammateImpacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
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
                  "max-w-full rounded border px-1.5 py-0.5 text-left text-[10px] font-semibold leading-snug break-words",
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
            <span className="basis-full text-[10px] leading-snug text-emerald-950/60 break-words">
              {detail.detail}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
