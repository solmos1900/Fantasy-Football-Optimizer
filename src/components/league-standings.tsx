"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FantasyTeam } from "@/lib/types";
import { formatRecord, cn } from "@/lib/utils";
import { PlayerRow } from "@/components/player-row";
import { sortByEspnRosterOrder } from "@/lib/roster-order";

/**
 * Standings-first league board: each team row expands in place to show
 * that roster. Only one team open at a time.
 */
export function LeagueStandings({ teams }: { teams: FantasyTeam[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  const standings = [...teams].sort(
    (a, b) => a.standing - b.standing || b.pointsFor - a.pointsFor,
  );

  function toggle(id: number) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  return (
    <ul className="divide-y divide-emerald-950/10">
      {standings.map((t) => {
        const open = openId === t.id;
        const roster = sortByEspnRosterOrder(t.roster);
        const panelId = `league-roster-${t.id}`;

        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => toggle(t.id)}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                "group flex w-full cursor-pointer items-center gap-3 px-1 py-3 text-left transition sm:gap-4 sm:px-1.5",
                t.isCurrentUser
                  ? "bg-orange-50/50 hover:bg-orange-50/80"
                  : "hover:bg-emerald-950/[0.04]",
                open && "bg-emerald-950/[0.06]",
              )}
            >
              <span className="w-7 shrink-0 type-stat text-xl tabular-nums text-emerald-950/55 sm:w-8 sm:text-2xl">
                {t.standing}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="truncate text-[15px] font-semibold text-emerald-950">
                    {t.name}
                  </span>
                  {t.isCurrentUser && (
                    <span className="stamp stamp-start text-[9px]">you</span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-emerald-950/45">
                  {formatRecord(t.wins, t.losses, t.ties)}
                  <span className="text-emerald-950/30"> · </span>
                  PF {t.pointsFor.toFixed(1)}
                  <span className="text-emerald-950/30"> · </span>
                  PA {t.pointsAgainst.toFixed(1)}
                </p>
              </div>

              <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40 transition group-hover:text-emerald-950/65 sm:inline">
                {open ? "Hide roster" : "View roster"}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-emerald-950/40 transition duration-200 group-hover:text-emerald-950/70",
                  open && "rotate-180 text-orange-600",
                )}
                aria-hidden
              />
            </button>

            {open && (
              <div
                id={panelId}
                className="border-t border-emerald-950/8 bg-emerald-950/[0.02] px-1 pb-3 pt-1 sm:px-1.5"
              >
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
                  Roster · {roster.length} players
                </p>
                <ul>
                  {roster.map((p) => (
                    <li key={p.id}>
                      <PlayerRow player={p} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
