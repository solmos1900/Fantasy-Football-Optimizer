"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";
import type {
  FantasyPlayer,
  FantasyTeam,
  LeagueData,
  PlayerTrendView,
} from "@/lib/types";
import {
  compareWhoToStart,
  isFlexEligible,
  type WhoToStartResult,
  type WhoToStartVerdict,
} from "@/lib/insights/who-to-start";
import { analyzeDefenseMatchup, matchupContextFromLeague } from "@/lib/insights/defense-matchups";
import { PositionChip } from "@/components/position-chip";
import { NflTeamBadge } from "@/components/nfl-team-badge";
import { Button } from "@/components/ui/button";
import { sortByEspnRosterOrder } from "@/lib/roster-order";

type SlotFilter = "QB" | "RB" | "WR" | "TE" | "FLEX" | "DEF";

const SLOT_FILTERS: SlotFilter[] = ["QB", "RB", "WR", "TE", "FLEX", "DEF"];

const VERDICT_STAMP: Record<WhoToStartVerdict, string> = {
  start_a: "stamp-start",
  start_b: "stamp-start",
  lean_a: "stamp-warning",
  lean_b: "stamp-warning",
  toss_up: "stamp-flex",
};

function toTrendMap(
  trends?: Map<number, PlayerTrendView> | Record<string, PlayerTrendView>,
): Map<number, PlayerTrendView> | undefined {
  if (!trends) return undefined;
  if (trends instanceof Map) return trends;
  const map = new Map<number, PlayerTrendView>();
  for (const [key, value] of Object.entries(trends)) {
    const id = Number(key);
    if (!Number.isNaN(id)) map.set(id, value);
  }
  return map;
}

function matchesFilter(player: FantasyPlayer, filter: SlotFilter): boolean {
  if (filter === "FLEX") return isFlexEligible(player.position);
  if (filter === "DEF") return player.position === "D/ST";
  return player.position === filter;
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

type BoardWeek = {
  week: number;
  pts: number | null;
  proj: number | null;
  opp: string | null;
};

function weeksForPlayer(
  player: FantasyPlayer,
  trend: PlayerTrendView | undefined,
  currentWeek: number,
): BoardWeek[] {
  const byWeek = new Map<number, BoardWeek>();

  for (const w of trend?.weeks ?? []) {
    byWeek.set(w.week, {
      week: w.week,
      pts: w.actual,
      proj: w.projected,
      opp: w.opponent ?? null,
    });
  }
  for (const w of player.recentWeeks ?? []) {
    const prev = byWeek.get(w.week);
    byWeek.set(w.week, {
      week: w.week,
      pts: w.points ?? prev?.pts ?? null,
      proj: w.projectedPoints ?? prev?.proj ?? null,
      opp: w.opponent ?? prev?.opp ?? null,
    });
  }

  // Ensure current week column exists (proj-only until scored).
  if (!byWeek.has(currentWeek)) {
    byWeek.set(currentWeek, {
      week: currentWeek,
      pts: player.actualPoints > 0 ? player.actualPoints : null,
      proj: player.projectedPoints,
      opp: player.opponent ?? null,
    });
  } else {
    const cur = byWeek.get(currentWeek)!;
    byWeek.set(currentWeek, {
      ...cur,
      proj: cur.proj ?? player.projectedPoints,
      opp: cur.opp ?? player.opponent ?? null,
      pts:
        cur.pts ??
        (player.actualPoints > 0 ? player.actualPoints : null),
    });
  }

  return [...byWeek.values()].sort((a, b) => a.week - b.week).slice(-6);
}

function unionWeeks(
  a: BoardWeek[],
  b: BoardWeek[],
): number[] {
  return [...new Set([...a, ...b].map((w) => w.week))].sort((x, y) => x - y);
}

function cellFor(
  weeks: BoardWeek[],
  week: number,
): BoardWeek | undefined {
  return weeks.find((w) => w.week === week);
}

function isOut(player: FantasyPlayer): boolean {
  return (
    player.injuryStatus === "OUT" ||
    player.injuryStatus === "IR" ||
    player.injuryStatus === "SUSPENSION"
  );
}

function matchupHint(
  player: FantasyPlayer,
  league: LeagueData,
): { tough: boolean; label: string } {
  const context = matchupContextFromLeague(league);
  const pool = [...league.teams.flatMap((t) => t.roster), ...league.freeAgents];
  const m = analyzeDefenseMatchup(player, pool, context);
  if (!m || m.samples.length === 0) {
    return { tough: false, label: "—" };
  }
  return {
    tough: m.toughMatchup,
    label: m.toughMatchup ? "Tough" : "OK",
  };
}

function PlayerPickCard({
  player,
  selected,
  onToggle,
  dimmed,
}: {
  player: FantasyPlayer;
  selected: boolean;
  onToggle: () => void;
  dimmed?: boolean;
}) {
  const injury = formatStatusCode(player.injuryStatus);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "relative flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
        selected
          ? "border-orange-600 bg-orange-50/40 shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand)_45%,transparent)]"
          : "border-emerald-950/12 bg-[var(--kraft)] hover:border-orange-600/40 hover:bg-orange-50/20",
        dimmed && "opacity-45",
        isOut(player) && !selected && "opacity-55",
      )}
    >
      {selected && (
        <span
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-emerald-50"
          aria-hidden
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      <PositionChip position={player.position} className="mt-0.5" />
      <NflTeamBadge team={player.nflTeam} className="mt-0.5 !h-7 !w-7 text-[8px]" />
      <div className="min-w-0 flex-1 pr-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-emerald-950">
            {player.name}
          </span>
          {injury !== "ACTIVE" && (
            <span
              className={cn(
                "rounded px-1 py-px text-[9px] font-semibold uppercase",
                statusColor(injury),
              )}
            >
              {injury}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-emerald-950/45">
          {player.nflTeam}
          {player.opponent ? ` · ${player.opponent}` : ""}
          {player.isStarter ? " · S" : player.slot === "BN" ? " · BN" : ""}
        </p>
        <p className="mt-1 type-stat text-lg leading-none text-orange-600">
          {player.projectedPoints.toFixed(1)}
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
            proj
          </span>
        </p>
      </div>
    </button>
  );
}

function CompareBoard({
  playerA,
  playerB,
  weeksA,
  weeksB,
  league,
}: {
  playerA: FantasyPlayer;
  playerB: FantasyPlayer;
  weeksA: BoardWeek[];
  weeksB: BoardWeek[];
  league: LeagueData;
}) {
  const weekCols = unionWeeks(weeksA, weeksB);
  const defA = matchupHint(playerA, league);
  const defB = matchupHint(playerB, league);
  const outA = isOut(playerA);
  const outB = isOut(playerB);

  type Row = {
    key: string;
    label: string;
    values: (string | null)[];
    favorMax?: boolean;
    highlight?: (i: number) => boolean;
    muted?: boolean;
  };

  const ptsRow = weekCols.map((w) => {
    const a = cellFor(weeksA, w)?.pts ?? null;
    const b = cellFor(weeksB, w)?.pts ?? null;
    return { a, b };
  });
  const projRow = weekCols.map((w) => {
    const a = cellFor(weeksA, w)?.proj ?? null;
    const b = cellFor(weeksB, w)?.proj ?? null;
    return { a, b };
  });

  const rows: Row[] = [
    {
      key: "pts",
      label: "PTS",
      favorMax: true,
      values: ptsRow.flatMap(({ a, b }) => [
        a != null ? a.toFixed(1) : "—",
        b != null ? b.toFixed(1) : "—",
      ]),
      highlight: (i) => {
        const pair = ptsRow[Math.floor(i / 2)];
        if (!pair || pair.a == null || pair.b == null) return false;
        const mine = i % 2 === 0 ? pair.a : pair.b;
        return mine === Math.max(pair.a, pair.b) && pair.a !== pair.b;
      },
    },
    {
      key: "targets",
      label: "TARGETS",
      values: weekCols.flatMap(() => ["—", "—"]),
      muted: true,
    },
    {
      key: "rush",
      label: "RUSH ATT",
      values: weekCols.flatMap(() => ["—", "—"]),
      muted: true,
    },
    {
      key: "opp",
      label: "OPP",
      values: weekCols.flatMap((w) => [
        cellFor(weeksA, w)?.opp ?? "—",
        cellFor(weeksB, w)?.opp ?? "—",
      ]),
    },
    {
      key: "def",
      label: "DEF vs POS",
      // Per-player season matchup lean (no weekly DEF rank feed yet).
      values: weekCols.flatMap(() => [defA.label, defB.label]),
      highlight: (i) => {
        const label = i % 2 === 0 ? defA.label : defB.label;
        const tough = i % 2 === 0 ? defA.tough : defB.tough;
        return label === "OK" && !tough;
      },
    },
    {
      key: "proj",
      label: "PROJ",
      favorMax: true,
      values: projRow.flatMap(({ a, b }) => [
        a != null ? a.toFixed(1) : "—",
        b != null ? b.toFixed(1) : "—",
      ]),
      highlight: (i) => {
        const pair = projRow[Math.floor(i / 2)];
        if (!pair || pair.a == null || pair.b == null) return false;
        const mine = i % 2 === 0 ? pair.a : pair.b;
        return mine === Math.max(pair.a, pair.b) && pair.a !== pair.b;
      },
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-950/12 bg-[var(--surface)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-emerald-950/10">
              <th className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
                Metric
              </th>
              {weekCols.map((w) => (
                <th
                  key={w}
                  colSpan={2}
                  className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-emerald-950/45"
                >
                  W{w}
                </th>
              ))}
            </tr>
            <tr className="border-b border-emerald-950/8 bg-emerald-950/[0.03]">
              <th className="sticky left-0 z-10 bg-[color-mix(in_srgb,var(--surface)_92%,#000)] px-3 py-1.5" />
              {weekCols.map((w) => (
                <th
                  key={`names-${w}`}
                  colSpan={2}
                  className="px-1 py-1.5 text-center text-[10px] font-medium text-emerald-950/55"
                >
                  <span className={cn(outA && "opacity-40")}>
                    {lastName(playerA.name)}
                  </span>
                  <span className="mx-1 text-emerald-950/25">/</span>
                  <span className={cn(outB && "opacity-40")}>
                    {lastName(playerB.name)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-emerald-950/5 last:border-0"
              >
                <th
                  className={cn(
                    "sticky left-0 z-10 bg-[var(--surface)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-emerald-950/50",
                    row.muted && "text-emerald-950/30",
                  )}
                >
                  {row.label}
                </th>
                {row.values.map((val, i) => {
                  const playerOut = i % 2 === 0 ? outA : outB;
                  const hi = row.highlight?.(i);
                  return (
                    <td
                      key={`${row.key}-${i}`}
                      className={cn(
                        "px-2 py-2 text-center tabular-nums",
                        playerOut && "opacity-40",
                        row.muted && "text-emerald-950/30",
                        hi &&
                          !row.muted &&
                          "font-semibold text-emerald-600",
                        !hi && !row.muted && "text-emerald-950/80",
                      )}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-emerald-950/8 px-3 py-2 text-[10px] text-emerald-950/40">
        TARGETS / RUSH ATT and weekly DEF ranks need usage feeds — showing — until
        available. DEF vs POS uses similar-player history vs this week&apos;s
        opponent when samples exist.
      </p>
    </div>
  );
}

function RosterModal({
  you,
  open,
  onClose,
}: {
  you: FantasyTeam;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  const roster = sortByEspnRosterOrder(you.roster);
  const starters = roster.filter((p) => p.isStarter);
  const bench = roster.filter((p) => !p.isStarter && p.slot !== "IR");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roster-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/65"
        aria-label="Close roster"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-emerald-950/15 bg-[var(--surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-emerald-950/10 px-4 py-3">
          <div>
            <h2
              id="roster-modal-title"
              className="type-section text-lg text-emerald-950"
            >
              My roster
            </h2>
            <p className="text-[11px] text-emerald-950/45">
              Reference only while you decide
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-950/55 hover:bg-emerald-950/10 hover:text-emerald-950"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
            Starters
          </p>
          <ul className="space-y-1.5">
            {starters.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg px-1 py-1"
              >
                <PositionChip
                  position={p.slot === "FLEX" ? "FLEX" : p.position}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-950">
                  {p.name}
                </span>
                {p.slot === "FLEX" && (
                  <span className="stamp stamp-flex text-[9px]">FLEX</span>
                )}
                <span className="type-stat text-sm text-orange-600">
                  {p.projectedPoints.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          {bench.length > 0 && (
            <>
              <p className="mb-2 mt-4 px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
                Bench
              </p>
              <ul className="space-y-1.5">
                {bench.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg px-1 py-1 opacity-80"
                  >
                    <PositionChip position={p.position} />
                    <span className="min-w-0 flex-1 truncate text-sm text-emerald-950">
                      {p.name}
                    </span>
                    <span className="type-stat text-sm text-emerald-950/50">
                      {p.projectedPoints.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RecommendationBar({
  result,
}: {
  result: WhoToStartResult;
}) {
  const startPlayer =
    result.verdict === "start_a" || result.verdict === "lean_a"
      ? result.playerA
      : result.verdict === "start_b" || result.verdict === "lean_b"
        ? result.playerB
        : null;
  const edgeReason = result.reasons[0] ?? result.summary;

  return (
    <div
      className={cn(
        "sticky bottom-[calc(3.75rem+max(0.75rem,env(safe-area-inset-bottom,0px))+var(--install-banner-offset,0px))] z-20",
        "-mx-1 rounded-2xl border border-orange-600/35 bg-[color-mix(in_srgb,var(--surface)_88%,#1a0820)] p-3 shadow-lg backdrop-blur-md sm:mx-0",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "stamp animate-stamp shrink-0 text-xs",
            VERDICT_STAMP[result.verdict],
          )}
        >
          ★ {result.verdictLabel.replace(" A", "").replace(" B", "")}
          {startPlayer ? ` ${lastName(startPlayer.name).toUpperCase()}` : ""}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">
            {result.headline}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-emerald-950/55">
            {edgeReason}
          </p>
        </div>
        {startPlayer && (
          <Button type="button" size="sm" className="shrink-0" disabled>
            Start {lastName(startPlayer.name)}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Locked Insights Start/Sit hybrid: B-style pick cards, multi-week board,
 * sticky recommendation, My Roster overlay.
 */
export function StartSitBoard({
  league,
  you,
  trends,
}: {
  league: LeagueData;
  you: FantasyTeam;
  trends?: Map<number, PlayerTrendView> | Record<string, PlayerTrendView>;
}) {
  const [filter, setFilter] = useState<SlotFilter>("FLEX");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rosterOpen, setRosterOpen] = useState(false);
  const trendMap = useMemo(() => toTrendMap(trends), [trends]);

  const pool = useMemo(() => {
    return [...you.roster]
      .filter((p) => p.slot !== "IR")
      .filter((p) => matchesFilter(p, filter))
      .sort((a, b) => {
        if (Boolean(a.isStarter) !== Boolean(b.isStarter)) {
          return a.isStarter ? -1 : 1;
        }
        return b.projectedPoints - a.projectedPoints;
      });
  }, [you.roster, filter]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => you.roster.find((p) => p.id === id) ?? pool.find((p) => p.id === id))
        .filter((p): p is FantasyPlayer => Boolean(p)),
    [selectedIds, you.roster, pool],
  );

  const playerA = selected[0] ?? null;
  const playerB = selected[1] ?? null;
  const flexMode = filter === "FLEX";

  const comparison = useMemo(() => {
    if (!playerA || !playerB) return null;
    return compareWhoToStart(league, playerA, playerB, trendMap, flexMode);
  }, [league, playerA, playerB, trendMap, flexMode]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1]!, id];
      return [...prev, id];
    });
  }

  function setFilterAndClear(next: SlotFilter) {
    setFilter(next);
    setSelectedIds([]);
  }

  const weeksA = playerA
    ? weeksForPlayer(
        playerA,
        trendMap?.get(playerA.espnId),
        league.currentWeek,
      )
    : [];
  const weeksB = playerB
    ? weeksForPlayer(
        playerB,
        trendMap?.get(playerB.espnId),
        league.currentWeek,
      )
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="type-section text-emerald-950">Start / Sit</h2>
          <p className="type-body mt-1 max-w-xl text-sm text-emerald-950/55">
            Tap two players to compare. Weigh projection, recent scores, injury,
            and defense history — no invented comps.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRosterOpen(true)}
        >
          My roster
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SLOT_FILTERS.map((slot) => {
          const active = filter === slot;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => setFilterAndClear(slot)}
              className={cn(
                "pos-chip h-auto min-w-0 px-2.5 py-1.5 text-[11px] transition",
                `pos-chip--${slot === "DEF" ? "def" : slot.toLowerCase()}`,
                !active && "opacity-50 hover:opacity-85",
                active && "ring-1 ring-orange-600/50",
              )}
              aria-pressed={active}
            >
              {slot === "DEF" ? "DEF" : slot}
            </button>
          );
        })}
      </div>

      {pool.length === 0 ? (
        <p className="rounded-xl border border-dashed border-emerald-950/10 px-4 py-3 text-sm text-emerald-950/50">
          No {filter === "DEF" ? "DEF" : filter} players on your roster.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {pool.map((p) => (
            <PlayerPickCard
              key={p.id}
              player={p}
              selected={selectedIds.includes(p.id)}
              onToggle={() => toggle(p.id)}
              dimmed={
                selectedIds.length === 2 && !selectedIds.includes(p.id)
              }
            />
          ))}
        </div>
      )}

      {playerA && playerB && comparison?.ok && (
        <>
          <CompareBoard
            playerA={playerA}
            playerB={playerB}
            weeksA={weeksA}
            weeksB={weeksB}
            league={league}
          />
          <RecommendationBar result={comparison} />
        </>
      )}

      {playerA && playerB && comparison && !comparison.ok && (
        <p className="rounded-xl border border-orange-600/30 bg-orange-50/30 px-4 py-3 text-sm text-orange-800">
          {comparison.message}
        </p>
      )}

      {selectedIds.length === 1 && (
        <p className="text-sm text-emerald-950/50">
          Pick one more {filter === "FLEX" ? "FLEX-eligible" : filter} to
          compare.
        </p>
      )}

      <RosterModal
        you={you}
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
      />
    </div>
  );
}
