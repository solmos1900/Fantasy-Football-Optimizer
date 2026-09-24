"use client";

import { useMemo, useState } from "react";
import type { FantasyPlayer, LeagueData } from "@/lib/types";
import { PlayerRow } from "@/components/player-row";
import { cn } from "@/lib/utils";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "D/ST"] as const;

export function PlayersDirectory({ league }: { league: LeagueData }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<string>("ALL");
  const [pool, setPool] = useState<"all" | "owned" | "free">("all");

  const ownership = useMemo(() => {
    const map = new Map<number, string>();
    for (const team of league.teams) {
      for (const p of team.roster) {
        map.set(p.espnId, team.name);
      }
    }
    return map;
  }, [league.teams]);

  const allPlayers: FantasyPlayer[] = useMemo(() => {
    const byId = new Map<number, FantasyPlayer>();
    for (const team of league.teams) {
      for (const p of team.roster) byId.set(p.espnId, p);
    }
    for (const p of league.freeAgents) {
      if (!byId.has(p.espnId)) byId.set(p.espnId, p);
    }
    return Array.from(byId.values()).sort(
      (a, b) => b.projectedPoints - a.projectedPoints,
    );
  }, [league]);

  const filtered = allPlayers.filter((p) => {
    if (position !== "ALL" && p.position !== position) return false;
    const owned = ownership.has(p.espnId);
    if (pool === "owned" && !owned) return false;
    if (pool === "free" && owned) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !p.nflTeam.toLowerCase().includes(q) &&
        !p.position.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const weekLabel = `WK${league.currentWeek}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm">
          <span className="mb-1.5 block font-medium text-emerald-950">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, team, position…"
            className="field-input"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-emerald-950">Pool</span>
          <select
            value={pool}
            onChange={(e) => setPool(e.target.value as typeof pool)}
            className="field-input"
          >
            <option value="all">All</option>
            <option value="owned">Owned</option>
            <option value="free">Free agents</option>
          </select>
        </label>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {POSITIONS.map((pos) => {
          const active = position === pos;
          return (
            <button
              key={pos}
              type="button"
              onClick={() => setPosition(pos)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-bold tracking-wide transition",
                active
                  ? "bg-emerald-950 text-emerald-50"
                  : "bg-emerald-100 text-emerald-950/55 hover:bg-emerald-200 hover:text-emerald-950/80",
              )}
            >
              {pos}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-emerald-950/50">{filtered.length} players</p>

      <ul className="divide-y divide-emerald-950/10">
        {filtered.slice(0, 80).map((p, i) => (
          <li key={p.id}>
            <PlayerRow
              player={p}
              showSlotBadge={false}
              showOwnership
              ownerLabel={ownership.get(p.espnId) ?? "FA"}
              rank={i + 1}
              weekLabel={weekLabel}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
