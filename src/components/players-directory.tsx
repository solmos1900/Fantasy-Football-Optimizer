"use client";

import { useMemo, useState } from "react";
import type { FantasyPlayer, LeagueData } from "@/lib/types";
import { cn, statusColor } from "@/lib/utils";

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
    return Array.from(byId.values()).sort((a, b) => b.projectedPoints - a.projectedPoints);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm">
          <span className="mb-1 block font-medium text-emerald-950">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, team, position…"
            className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 outline-none ring-orange-500/30 focus:ring-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-emerald-950">Position</span>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="rounded-md border border-emerald-950/15 bg-white px-3 py-2 outline-none"
          >
            {["ALL", "QB", "RB", "WR", "TE", "K", "D/ST"].map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-emerald-950">Pool</span>
          <select
            value={pool}
            onChange={(e) => setPool(e.target.value as typeof pool)}
            className="rounded-md border border-emerald-950/15 bg-white px-3 py-2 outline-none"
          >
            <option value="all">All</option>
            <option value="owned">Owned</option>
            <option value="free">Free agents</option>
          </select>
        </label>
      </div>

      <p className="text-xs text-emerald-950/50">{filtered.length} players</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-emerald-950/10 text-xs uppercase tracking-wider text-emerald-950/45">
              <th className="py-2 pr-2 font-semibold">Player</th>
              <th className="py-2 pr-2 font-semibold">Pos</th>
              <th className="py-2 pr-2 font-semibold">Owner</th>
              <th className="py-2 pr-2 font-semibold">Own%</th>
              <th className="py-2 pr-2 font-semibold">Proj</th>
              <th className="py-2 font-semibold">Actual</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 80).map((p) => (
              <tr key={p.id} className="border-b border-emerald-950/5">
                <td className="py-2.5 pr-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-emerald-950/45">{p.nflTeam}</span>
                  {p.injuryStatus !== "ACTIVE" && (
                    <span
                      className={cn(
                        "ml-2 rounded px-1 py-0.5 text-[10px] font-semibold uppercase",
                        statusColor(p.injuryStatus),
                      )}
                    >
                      {p.injuryStatus}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-2">{p.position}</td>
                <td className="py-2.5 pr-2 text-emerald-950/60">
                  {ownership.get(p.espnId) ?? "FA"}
                </td>
                <td className="py-2.5 pr-2">{p.percentOwned.toFixed(0)}%</td>
                <td className="py-2.5 pr-2 font-[family-name:var(--font-display)] text-base">
                  {p.projectedPoints.toFixed(1)}
                </td>
                <td className="py-2.5 font-[family-name:var(--font-display)] text-base text-orange-600">
                  {p.actualPoints > 0 ? p.actualPoints.toFixed(1) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
