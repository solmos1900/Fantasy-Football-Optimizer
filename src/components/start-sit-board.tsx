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
} from "@/lib/insights/who-to-start";
import {
  analyzeDefenseMatchup,
  matchupContextFromLeague,
} from "@/lib/insights/defense-matchups";
import { PositionChip } from "@/components/position-chip";
import { Button } from "@/components/ui/button";
import { sortByEspnRosterOrder } from "@/lib/roster-order";

type SlotFilter = "QB" | "RB" | "WR" | "TE" | "FLEX" | "DEF";

const SLOT_FILTERS: SlotFilter[] = ["QB", "RB", "WR", "TE", "FLEX", "DEF"];

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

function isOut(player: FantasyPlayer): boolean {
  return (
    player.injuryStatus === "OUT" ||
    player.injuryStatus === "IR" ||
    player.injuryStatus === "SUSPENSION"
  );
}

function healthLabel(player: FantasyPlayer): string {
  if (player.injuryStatus === "ACTIVE") return "HEALTHY";
  return formatStatusCode(player.injuryStatus);
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

  return [...byWeek.values()].sort((a, b) => a.week - b.week).slice(-5);
}

function cellFor(weeks: BoardWeek[], week: number): BoardWeek | undefined {
  return weeks.find((w) => w.week === week);
}

function defChip(
  player: FantasyPlayer,
  league: LeagueData,
): { tough: boolean; label: string } {
  const context = matchupContextFromLeague(league);
  const pool = [...league.teams.flatMap((t) => t.roster), ...league.freeAgents];
  const m = analyzeDefenseMatchup(player, pool, context);
  const pos = player.position === "D/ST" ? "DEF" : player.position;
  if (!m || m.samples.length === 0) {
    return { tough: false, label: `vs ${pos} · —` };
  }
  return {
    tough: m.toughMatchup,
    label: m.toughMatchup ? `vs ${pos} · Tough` : `vs ${pos} · OK`,
  };
}

/** B-style pick card — purple border + check when selected. */
function PlayerPickCard({
  player,
  selected,
  onToggle,
  week,
  league,
}: {
  player: FantasyPlayer;
  selected: boolean;
  onToggle: () => void;
  week: number;
  league: LeagueData;
}) {
  const out = isOut(player);
  const health = healthLabel(player);
  const def = defChip(player, league);
  const proj = out ? 0 : player.projectedPoints;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "relative w-full rounded-xl border px-3.5 py-3 text-left transition",
        selected
          ? "border-orange-600 bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand)_50%,transparent)]"
          : "border-emerald-950/14 bg-[var(--kraft)] hover:border-orange-600/40",
        out && "opacity-70",
      )}
    >
      <span
        className={cn(
          "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border",
          selected
            ? "border-orange-600 bg-orange-600 text-white"
            : "border-emerald-950/30 bg-transparent text-transparent",
        )}
        aria-hidden
      >
        {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>

      <div className="flex flex-wrap items-center gap-1.5 pr-7">
        <PositionChip position={player.position} />
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            out || health !== "HEALTHY"
              ? statusColor(player.injuryStatus)
              : "stamp stamp-success text-[9px]",
          )}
        >
          {health}
        </span>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-base font-semibold leading-tight",
              out ? "text-emerald-950/45" : "text-emerald-950",
            )}
          >
            {player.name}
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-950/45">
            {player.nflTeam} · Week {week}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "type-stat text-2xl leading-none",
              out ? "text-danger" : "text-emerald-950",
            )}
          >
            {proj.toFixed(1)}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
            proj
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-emerald-950/50">
          {player.opponent ? `Faces ${player.opponent}` : "Matchup TBD"}
        </p>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            def.tough
              ? "border-danger/45 text-[color-mix(in_srgb,var(--danger)_55%,white)]"
              : "border-success/45 text-[color-mix(in_srgb,var(--success)_55%,white)]",
          )}
        >
          {def.label}
        </span>
      </div>
    </button>
  );
}

/**
 * Side-by-side multi-week board: sticky metric labels, per-player week columns.
 * TARGETS / RUSH ATT / numeric DEF RANK show — until usage feeds exist.
 */
function CompareBoard({
  players,
  weeksById,
  weekCols,
  league,
  favorId,
}: {
  players: FantasyPlayer[];
  weeksById: Map<string, BoardWeek[]>;
  weekCols: number[];
  league: LeagueData;
  favorId: string | null;
}) {
  const defs = useMemo(
    () => new Map(players.map((p) => [p.id, defChip(p, league)])),
    [players, league],
  );

  const metrics: {
    key: string;
    label: string;
    muted?: boolean;
    get: (p: FantasyPlayer, w: number) => string;
    numeric?: (p: FantasyPlayer, w: number) => number | null;
  }[] = [
    {
      key: "pts",
      label: "PTS",
      get: (p, w) => {
        const v = cellFor(weeksById.get(p.id) ?? [], w)?.pts;
        return v != null ? v.toFixed(1) : "—";
      },
      numeric: (p, w) => cellFor(weeksById.get(p.id) ?? [], w)?.pts ?? null,
    },
    {
      key: "targets",
      label: "TARGETS",
      muted: true,
      get: () => "—",
    },
    {
      key: "rush",
      label: "RUSH ATT",
      muted: true,
      get: () => "—",
    },
    {
      key: "opp",
      label: "OPP",
      get: (p, w) => cellFor(weeksById.get(p.id) ?? [], w)?.opp ?? "—",
    },
    {
      key: "def",
      label: "DEF RANK",
      get: (p) => defs.get(p.id)?.label ?? "—",
    },
    {
      key: "proj",
      label: "PROJ",
      get: (p, w) => {
        if (isOut(p) && w === weekCols[weekCols.length - 1]) return "0.0";
        const v = cellFor(weeksById.get(p.id) ?? [], w)?.proj;
        return v != null ? v.toFixed(1) : "—";
      },
      numeric: (p, w) => {
        if (isOut(p) && w === weekCols[weekCols.length - 1]) return 0;
        return cellFor(weeksById.get(p.id) ?? [], w)?.proj ?? null;
      },
    },
  ];

  function isFavorable(
    metric: (typeof metrics)[number],
    week: number,
    player: FantasyPlayer,
  ): boolean {
    if (!metric.numeric || metric.muted) return false;
    const vals = players
      .map((p) => ({ id: p.id, v: metric.numeric!(p, week) }))
      .filter((x) => x.v != null) as { id: string; v: number }[];
    if (vals.length < 2) return false;
    const max = Math.max(...vals.map((x) => x.v));
    const mine = vals.find((x) => x.id === player.id)?.v;
    return mine != null && mine === max && vals.some((x) => x.v < max);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-950/12 bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-emerald-950/10 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-950/45">
          Selected · last {weekCols.length} weeks
        </p>
        <p className="text-[10px] text-emerald-950/35">⟷ scroll weeks</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-emerald-950/10">
              <th className="sticky left-0 z-20 bg-[var(--surface)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
                Weeks
              </th>
              {players.map((p) => (
                <th
                  key={p.id}
                  colSpan={weekCols.length}
                  className={cn(
                    "border-l border-emerald-950/8 px-2 py-2 text-center text-[11px] font-semibold",
                    favorId === p.id
                      ? "text-emerald-950"
                      : "text-emerald-950/45",
                    isOut(p) && "opacity-45",
                  )}
                >
                  {lastName(p.name)}
                  <span className="ml-1 font-normal text-emerald-950/40">
                    {p.nflTeam}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="border-b border-emerald-950/8 bg-emerald-950/[0.03]">
              <th className="sticky left-0 z-20 bg-[color-mix(in_srgb,var(--surface)_92%,#000)] px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-emerald-950/35">
                —
              </th>
              {players.map((p) =>
                weekCols.map((w) => (
                  <th
                    key={`${p.id}-w${w}`}
                    className={cn(
                      "min-w-[2.75rem] px-1.5 py-1.5 text-center text-[10px] font-semibold text-emerald-950/45",
                      p.id === players[0]?.id ? "border-l border-emerald-950/8" : "",
                      isOut(p) && "opacity-40",
                    )}
                  >
                    W{w}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr
                key={metric.key}
                className="border-b border-emerald-950/5 last:border-0"
              >
                <th
                  className={cn(
                    "sticky left-0 z-20 bg-[var(--surface)] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-emerald-950/50",
                    metric.muted && "text-emerald-950/30",
                  )}
                >
                  {metric.label}
                </th>
                {players.map((p, pi) =>
                  weekCols.map((w) => {
                    const val = metric.get(p, w);
                    const hi = isFavorable(metric, w, p);
                    const out = isOut(p);
                    const defTough =
                      metric.key === "def" ? defs.get(p.id)?.tough : undefined;
                    return (
                      <td
                        key={`${metric.key}-${p.id}-${w}`}
                        className={cn(
                          "px-1.5 py-2.5 text-center tabular-nums",
                          pi === 0 && "border-l border-emerald-950/8",
                          out && "opacity-40",
                          metric.muted && "text-emerald-950/30",
                          hi && !metric.muted && "font-semibold text-success",
                          !hi &&
                            !metric.muted &&
                            favorId === p.id &&
                            "text-emerald-950",
                          !hi &&
                            !metric.muted &&
                            favorId !== p.id &&
                            "text-emerald-950/55",
                          metric.key === "def" &&
                            !metric.muted &&
                            "text-[10px] font-semibold",
                          metric.key === "def" &&
                            defTough === true &&
                            "text-danger",
                          metric.key === "def" &&
                            defTough === false &&
                            val !== "—" &&
                            "text-success",
                          metric.key === "proj" &&
                            out &&
                            "font-semibold text-danger opacity-100",
                        )}
                      >
                        {metric.key === "def" && val !== "—" ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-1.5 py-0.5",
                              defTough
                                ? "border-danger/40"
                                : "border-success/40",
                            )}
                          >
                            {val}
                          </span>
                        ) : (
                          val
                        )}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-emerald-950/8 px-3 py-2 text-[10px] text-emerald-950/40">
        ⟷ Weeks grow as the season progresses (W1…Wn). Sticky metric labels stay
        put. TARGETS / RUSH ATT / weekly DEF ranks need usage feeds — showing —
        until available; DEF RANK uses similar-player history when samples
        exist.
      </p>
    </div>
  );
}

function RosterModal({
  you,
  open,
  onClose,
  flexMode,
  flexPick,
  onPickFlex,
}: {
  you: FantasyTeam;
  open: boolean;
  onClose: () => void;
  flexMode: boolean;
  flexPick: FantasyPlayer | null;
  onPickFlex?: () => void;
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
        className="absolute inset-0 bg-black/70"
        aria-label="Close roster"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-emerald-950/15 bg-[var(--surface)] shadow-xl">
        <div className="flex items-start justify-between border-b border-emerald-950/10 px-4 py-3">
          <div>
            <h2
              id="roster-modal-title"
              className="text-lg font-semibold text-emerald-950"
            >
              My roster
            </h2>
            <p className="mt-0.5 text-[11px] text-emerald-950/45">
              Reference only — decide FLEX without leaving compare.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-950/15 text-emerald-950/55 hover:bg-emerald-950/10 hover:text-emerald-950"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
            Starters
          </p>
          <ul className="divide-y divide-emerald-950/8">
            {starters.map((p) => {
              const isFlexSlot = p.slot === "FLEX";
              const undecided = flexMode && isFlexSlot && !flexPick;
              const out = isOut(p);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 px-1 py-2.5"
                >
                  <PositionChip
                    position={isFlexSlot ? "FLEX" : p.position}
                  />
                  {undecided ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm italic text-emerald-950/40">
                        undecided
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onPickFlex?.();
                          onClose();
                        }}
                        className="stamp stamp-flex shrink-0 cursor-pointer text-[10px]"
                      >
                        PICK
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-950">
                        {isFlexSlot && flexPick ? flexPick.name : p.name}
                        {out && (
                          <span className="ml-1.5 rounded bg-danger/20 px-1 py-px text-[9px] font-bold uppercase text-danger">
                            OUT
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "type-stat shrink-0 text-sm",
                          out ? "text-danger" : "text-emerald-950",
                        )}
                      >
                        {out
                          ? "0.0"
                          : (isFlexSlot && flexPick
                              ? flexPick.projectedPoints
                              : p.projectedPoints
                            ).toFixed(1)}
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {bench.length > 0 && (
            <>
              <p className="mb-2 mt-4 px-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/40">
                Bench
              </p>
              <ul className="divide-y divide-emerald-950/8">
                {bench.map((p) => {
                  const out = isOut(p);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 px-1 py-2.5"
                    >
                      <PositionChip position={p.position} />
                      <span className="min-w-0 flex-1 truncate text-sm text-emerald-950">
                        {p.name}
                        {out && (
                          <span className="ml-1.5 rounded bg-danger/20 px-1 py-px text-[9px] font-bold uppercase text-danger">
                            OUT
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "type-stat shrink-0 text-sm",
                          out ? "text-danger" : "text-emerald-950/55",
                        )}
                      >
                        {out ? "0.0" : p.projectedPoints.toFixed(1)}
                      </span>
                    </li>
                  );
                })}
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
  flexMode,
}: {
  result: WhoToStartResult;
  flexMode: boolean;
}) {
  const startPlayer =
    result.verdict === "start_a" || result.verdict === "lean_a"
      ? result.playerA
      : result.verdict === "start_b" || result.verdict === "lean_b"
        ? result.playerB
        : null;
  const other =
    startPlayer?.id === result.playerA.id ? result.playerB : result.playerA;
  const edgeAbs = Math.abs(result.edge).toFixed(1);
  const edgeLine = startPlayer
    ? isOut(other)
      ? `+${edgeAbs} edge · ${lastName(other.name)} OUT (0.0)`
      : `+${edgeAbs} edge over ${lastName(other.name)}`
    : result.summary;

  return (
    <div
      className={cn(
        "sticky bottom-[calc(3.75rem+max(0.75rem,env(safe-area-inset-bottom,0px))+var(--install-banner-offset,0px))] z-20",
        "rounded-2xl border border-orange-600/40 bg-[color-mix(in_srgb,#1a0820_75%,var(--surface))] p-3 shadow-lg backdrop-blur-md",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="stamp stamp-success animate-stamp text-xs">
            ★ START
          </span>
          {startPlayer && <PositionChip position={startPlayer.position} />}
          {flexMode && <PositionChip position="FLEX" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950">
            {startPlayer?.name ?? result.headline}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-emerald-950/55">
            {edgeLine}
          </p>
        </div>
        {startPlayer && (
          <Button type="button" size="sm" className="shrink-0">
            Start {lastName(startPlayer.name)}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Locked Insights Start/Sit hybrid (mock: B cards + multi-week board + roster overlay).
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
  const flexMode = filter === "FLEX";
  const maxSelect = flexMode ? 3 : 2;

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
        .map(
          (id) =>
            you.roster.find((p) => p.id === id) ??
            pool.find((p) => p.id === id),
        )
        .filter((p): p is FantasyPlayer => Boolean(p)),
    [selectedIds, you.roster, pool],
  );

  /** Pair used for the START call — prefer highest-projected available. */
  const comparePair = useMemo(() => {
    if (selected.length < 2) return null;
    const ranked = [...selected].sort((a, b) => {
      if (isOut(a) !== isOut(b)) return isOut(a) ? 1 : -1;
      return b.projectedPoints - a.projectedPoints;
    });
    return { a: ranked[0]!, b: ranked[1]! };
  }, [selected]);

  const comparison = useMemo(() => {
    if (!comparePair) return null;
    return compareWhoToStart(
      league,
      comparePair.a,
      comparePair.b,
      trendMap,
      flexMode,
    );
  }, [league, comparePair, trendMap, flexMode]);

  const favorId =
    comparison?.ok &&
    (comparison.verdict === "start_a" || comparison.verdict === "lean_a")
      ? comparison.playerA.id
      : comparison?.ok &&
          (comparison.verdict === "start_b" || comparison.verdict === "lean_b")
        ? comparison.playerB.id
        : null;

  const flexPick =
    flexMode && comparison?.ok && favorId
      ? selected.find((p) => p.id === favorId) ?? null
      : null;

  const weeksById = useMemo(() => {
    const map = new Map<string, BoardWeek[]>();
    for (const p of selected) {
      map.set(
        p.id,
        weeksForPlayer(p, trendMap?.get(p.espnId), league.currentWeek),
      );
    }
    return map;
  }, [selected, trendMap, league.currentWeek]);

  const weekCols = useMemo(() => {
    const set = new Set<number>();
    for (const weeks of weeksById.values()) {
      for (const w of weeks) set.add(w.week);
    }
    return [...set].sort((a, b) => a - b).slice(-5);
  }, [weeksById]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxSelect) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }

  function setFilterAndClear(next: SlotFilter) {
    setFilter(next);
    setSelectedIds([]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-section text-emerald-950">Start / Sit</h2>
            <span className="stamp stamp-start text-[9px]">
              Compare · Hybrid B+Table
            </span>
          </div>
          <p className="type-eyebrow mt-2 text-emerald-950/45">
            Comparing for · Tap to select · Compare weeks below
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

      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SLOT_FILTERS.map((slot) => {
            const active = filter === slot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => setFilterAndClear(slot)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide transition",
                  active
                    ? "bg-orange-600 text-white"
                    : "bg-emerald-100 text-emerald-950/55 hover:bg-emerald-200",
                )}
                aria-pressed={active}
              >
                {slot}
              </button>
            );
          })}
        </div>
        {flexMode && (
          <p className="mt-1.5 text-[11px] text-emerald-950/45">
            FLEX pool = RB / WR / TE from your roster (league rules).
          </p>
        )}
      </div>

      {pool.length === 0 ? (
        <p className="rounded-xl border border-dashed border-emerald-950/10 px-4 py-3 text-sm text-emerald-950/50">
          No {filter} players on your roster.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {pool.map((p) => (
            <PlayerPickCard
              key={p.id}
              player={p}
              selected={selectedIds.includes(p.id)}
              onToggle={() => toggle(p.id)}
              week={league.currentWeek}
              league={league}
            />
          ))}
        </div>
      )}

      {selected.length >= 2 && (
        <CompareBoard
          players={selected}
          weeksById={weeksById}
          weekCols={weekCols}
          league={league}
          favorId={favorId}
        />
      )}

      {selected.length >= 2 && comparison?.ok && (
        <RecommendationBar result={comparison} flexMode={flexMode} />
      )}

      {selected.length >= 2 && comparison && !comparison.ok && (
        <p className="rounded-xl border border-orange-600/30 bg-orange-50/30 px-4 py-3 text-sm text-orange-800">
          {comparison.message}
        </p>
      )}

      {selected.length === 1 && (
        <p className="text-sm text-emerald-950/50">
          Pick {maxSelect === 3 ? "1–2 more" : "one more"}{" "}
          {flexMode ? "FLEX-eligible" : filter} to compare.
        </p>
      )}

      <RosterModal
        you={you}
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        flexMode={flexMode}
        flexPick={flexPick}
        onPickFlex={() => {
          /* Keep compare open; PICK just closes modal so user can tap a card. */
        }}
      />
    </div>
  );
}
