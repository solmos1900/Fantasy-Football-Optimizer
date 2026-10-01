"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";
import type {
  FantasyPlayer,
  LeagueData,
  PlayerNewsItem,
  PlayerTrendView,
} from "@/lib/types";
import type { PlayerDetailInsight } from "@/lib/insights/player-detail";
import { inferPlayerRole } from "@/lib/insights/defense-matchups";
import { PositionChip } from "@/components/position-chip";
import { buttonVariants } from "@/components/ui/button";

type Tab = "logs" | "insights";
type YearTab = "current" | "prior" | "career";

function healthLabel(player: FantasyPlayer): string {
  if (player.injuryStatus === "ACTIVE") return "HEALTHY";
  return formatStatusCode(player.injuryStatus);
}

function deriveRanks(league: LeagueData, player: FantasyPlayer) {
  const pool = [
    ...league.teams.flatMap((t) => t.roster),
    ...league.freeAgents,
  ];
  const byProj = (a: FantasyPlayer, b: FantasyPlayer) =>
    b.projectedPoints - a.projectedPoints;

  const samePos = pool
    .filter((p) => p.position === player.position)
    .sort(byProj);
  const overall = [...pool].sort(byProj);

  const posIdx = samePos.findIndex((p) => p.id === player.id);
  const ovrIdx = overall.findIndex((p) => p.id === player.id);

  const role = inferPlayerRole(player);
  let posRankLabel = `${player.position}${posIdx >= 0 ? posIdx + 1 : "—"}`;
  if (role === "rb1") posRankLabel = "RB1";
  if (role === "rb2") posRankLabel = "RB2";
  if (role === "wr_slot" || role === "wr_outside") {
    posRankLabel = `WR${posIdx >= 0 ? posIdx + 1 : ""}`;
  }

  return {
    posRankLabel,
    overallLabel: ovrIdx >= 0 ? `#${ovrIdx + 1}` : "—",
  };
}

type LogRow = {
  week: number;
  opponent: string;
  points: number | null;
  projected: number | null;
  upcoming: boolean;
};

function buildLogRows(
  player: FantasyPlayer,
  trend: PlayerTrendView | null,
  currentWeek: number,
): LogRow[] {
  const byWeek = new Map<number, LogRow>();

  for (const w of trend?.weeks ?? []) {
    byWeek.set(w.week, {
      week: w.week,
      opponent: w.opponent?.trim() || "—",
      points: w.actual,
      projected: w.projected,
      upcoming: w.actual == null && w.week >= currentWeek,
    });
  }
  for (const w of player.recentWeeks ?? []) {
    const prev = byWeek.get(w.week);
    byWeek.set(w.week, {
      week: w.week,
      opponent: w.opponent?.trim() || prev?.opponent || "—",
      points: w.points ?? prev?.points ?? null,
      projected: w.projectedPoints ?? prev?.projected ?? null,
      upcoming: false,
    });
  }

  // Current week row
  if (!byWeek.has(currentWeek)) {
    byWeek.set(currentWeek, {
      week: currentWeek,
      opponent: player.opponent?.trim() || "—",
      points: player.actualPoints > 0 ? player.actualPoints : null,
      projected: player.projectedPoints,
      upcoming: player.actualPoints <= 0,
    });
  }

  // Pad a couple upcoming placeholders if we only have past weeks
  const maxWeek = Math.max(...byWeek.keys(), currentWeek);
  for (let w = currentWeek + 1; w <= Math.min(maxWeek + 2, currentWeek + 2); w++) {
    if (!byWeek.has(w)) {
      byWeek.set(w, {
        week: w,
        opponent: "—",
        points: null,
        projected: null,
        upcoming: true,
      });
    }
  }

  return [...byWeek.values()].sort((a, b) => a.week - b.week).slice(0, 8);
}

function seasonAvg(rows: LogRow[]): number | null {
  const scored = rows.filter((r) => r.points != null && !r.upcoming);
  if (!scored.length) return null;
  return (
    scored.reduce((s, r) => s + (r.points ?? 0), 0) / scored.length
  );
}

function StatTile({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-emerald-950/10 bg-emerald-950/[0.04] px-1.5 py-1.5 text-center">
      <p className="type-stat text-base leading-none text-emerald-950 sm:text-lg">
        {value}
      </p>
      <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-emerald-950/45">
        {label}
      </p>
    </div>
  );
}

function GameLogTable({
  rows,
  dense,
}: {
  rows: LogRow[];
  dense?: boolean;
}) {
  /** Usage columns reserved — show — until nflverse/ESPN usage lands. */
  const mobileCols = ["WK", "OPP", "ATT", "RUSH", "TD", "TAR", "R", "FPTS"] as const;
  const desktopCols = [
    "WK",
    "OPP",
    "ATT",
    "RUSH",
    "YPC",
    "TD",
    "TAR",
    "REC",
    "YDS",
    "REC TD",
    "FPTS",
  ] as const;
  const cols = dense ? mobileCols : desktopCols;

  function cell(col: string, row: LogRow): string {
    if (col === "WK") return String(row.week);
    if (col === "OPP") return row.opponent;
    if (col === "FPTS") {
      if (row.upcoming || row.points == null) return "—";
      return row.points.toFixed(1);
    }
    return "—";
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-emerald-950/10">
      <table className="w-full min-w-[28rem] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-emerald-950/10 bg-emerald-950/[0.03]">
            {cols.map((col) => (
              <th
                key={col}
                className={cn(
                  "px-1.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-950/45",
                  col === "FPTS" &&
                    "sticky right-0 z-10 bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))] text-orange-700",
                  col === "WK" && "w-8",
                )}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.week}
              className={cn(
                "border-b border-emerald-950/5 last:border-0",
                row.upcoming && "opacity-55",
              )}
            >
              {cols.map((col) => {
                const val = cell(col, row);
                const isFpts = col === "FPTS";
                return (
                  <td
                    key={col}
                    className={cn(
                      "px-1.5 py-1.5 tabular-nums",
                      isFpts &&
                        "sticky right-0 z-10 bg-[color-mix(in_srgb,var(--brand)_12%,var(--surface))] font-semibold text-emerald-950",
                      col === "OPP" && "text-emerald-950/70",
                      !isFpts && col !== "OPP" && "text-emerald-950/55",
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
  );
}

function InsightsFeed({
  insight,
  news,
  currentWeek,
}: {
  insight: PlayerDetailInsight;
  news: PlayerNewsItem[];
  currentWeek: number;
}) {
  const cards: { eyebrow: string; title: string; body: string; href?: string }[] =
    [];

  for (const n of news.slice(0, 2)) {
    const when = n.publishedAt
      ? new Date(n.publishedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "News";
    cards.push({
      eyebrow: `${when} · ${n.source ?? "News"}`,
      title: n.headline,
      body: n.description ?? "Open source for full report.",
      href: n.url,
    });
  }

  cards.push({
    eyebrow: `Analysis · Week ${currentWeek}`,
    title: insight.headline,
    body: insight.reasons[0] ?? insight.formSummary ?? "Lean based on projection, form, and matchup.",
  });

  if (insight.matchupSummary) {
    cards.push({
      eyebrow: `Matchup · Week ${currentWeek}`,
      title: insight.venue.label,
      body: insight.matchupSummary,
    });
  }

  if (!cards.length) {
    return (
      <p className="text-sm text-emerald-950/50">
        No news or analysis cards yet for this player.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {cards.map((c) => (
        <li
          key={`${c.eyebrow}-${c.title}`}
          className="rounded-lg border border-emerald-950/10 bg-emerald-950/[0.03] px-2.5 py-2"
        >
          <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-950/40">
            {c.eyebrow}
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-emerald-950">
            {c.title}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-emerald-950/60">
            {c.body}
          </p>
          {c.href && (
            <a
              href={c.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs font-semibold text-orange-700 hover:text-orange-600"
            >
              Read source →
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PlayerDetailSheet({
  player,
  league,
  insight,
  trend,
  news,
  scoringLabel = "Half-PPR",
}: {
  player: FantasyPlayer;
  league: LeagueData;
  insight: PlayerDetailInsight;
  trend: PlayerTrendView | null;
  news: PlayerNewsItem[];
  scoringLabel?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("logs");
  const [year, setYear] = useState<YearTab>("current");
  const ranks = useMemo(() => deriveRanks(league, player), [league, player]);
  const logRows = useMemo(
    () => buildLogRows(player, trend, league.currentWeek),
    [player, trend, league.currentWeek],
  );
  const avg = seasonAvg(logRows.filter((r) => !r.upcoming || r.points != null));
  const health = healthLabel(player);
  const out =
    player.injuryStatus === "OUT" ||
    player.injuryStatus === "IR" ||
    player.injuryStatus === "SUSPENSION";

  const yearLabel =
    year === "current"
      ? String(league.season)
      : year === "prior"
        ? String(league.season - 1)
        : "Career";

  const showLogs = year === "current" ? logRows : [];

  function close() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/players");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
    // close is stable enough for mount lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headerMeta = (
    <div className="flex flex-wrap items-center gap-1.5">
      <PositionChip position={player.position} />
      <span className="text-sm font-medium text-emerald-950">{player.nflTeam}</span>
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
      <span className="hidden rounded-md border border-emerald-950/12 bg-emerald-950/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950/70 sm:inline">
        {ranks.posRankLabel}
      </span>
      <span className="hidden rounded-md border border-emerald-950/12 bg-emerald-950/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950/70 sm:inline">
        {ranks.overallLabel} OVR
      </span>
      <span className="text-[11px] text-emerald-950/45">
        {insight.venue.label}
      </span>
    </div>
  );

  const yearTabs = (
    <div className="flex flex-wrap items-center gap-1.5">
      {(
        [
          ["current", String(league.season)],
          ["prior", String(league.season - 1)],
          ["career", "Career"],
        ] as const
      ).map(([id, label]) => {
        const active = year === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setYear(id)}
            className={cn(
              "rounded-md px-2.5 py-0.5 text-[11px] font-bold tracking-wide transition",
              active
                ? "bg-orange-600 text-white"
                : "border border-emerald-950/20 text-emerald-950/55 hover:border-orange-600/40 hover:text-emerald-950",
            )}
          >
            {label}
          </button>
        );
      })}
      <span className="hidden text-[11px] text-emerald-950/45 sm:inline">
        Season avg{" "}
        <span className="font-semibold text-emerald-950">
          {avg != null ? avg.toFixed(1) : "—"} FPTS
        </span>{" "}
        · {scoringLabel}
      </span>
    </div>
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/trades?tool=who-to-start"
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "flex-1 sm:flex-none",
        })}
      >
        Add to compare
      </Link>
      <Link
        href="/insights"
        className={buttonVariants({
          size: "sm",
          className: "flex-1 sm:flex-none",
        })}
      >
        {insight.lean === "START" ? "Start lean" : `${insight.lean} lean`}
      </Link>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close player detail"
        onClick={close}
      />

      {/* Mobile M1 — bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-sheet-title"
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-emerald-950/15 bg-[var(--surface)] shadow-2xl sm:hidden"
      >
        <div className="flex items-center justify-center pt-1.5">
          <span className="h-1 w-9 rounded-full bg-emerald-950/25" aria-hidden />
        </div>
        <div className="flex items-start justify-between gap-2 px-3 pb-1.5 pt-0.5">
          <div className="min-w-0">
            <h1
              id="player-sheet-title"
              className="truncate text-lg font-semibold tracking-tight text-emerald-950"
            >
              {player.name}
            </h1>
            <div className="mt-1">{headerMeta}</div>
          </div>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-950/15 text-emerald-950/55 hover:bg-emerald-950/10"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 px-3 pb-2">
          <StatTile value={ranks.posRankLabel} label="Pos rank" />
          <StatTile value={ranks.overallLabel} label="Overall" />
          <StatTile
            value={`${player.percentOwned.toFixed(0)}%`}
            label="Rostered"
          />
          <StatTile
            value={`${player.percentStarted.toFixed(0)}%`}
            label="Started"
          />
        </div>

        <div className="flex border-b border-emerald-950/10 bg-emerald-950/[0.03] px-1">
          {(["logs", "insights"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 py-2 text-center text-sm font-semibold capitalize transition",
                tab === id
                  ? "border-b-2 border-orange-600 text-emerald-950"
                  : "text-emerald-950/45",
              )}
            >
              {id}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          {tab === "logs" ? (
            <div className="space-y-2">
              {yearTabs}
              {year !== "current" ? (
                <p className="text-sm text-emerald-950/50">
                  No {yearLabel} game log stored yet — sync seasons to fill this
                  tab.
                </p>
              ) : showLogs.length === 0 ? (
                <p className="text-sm text-emerald-950/50">
                  No week scores stored for this player yet.
                </p>
              ) : (
                <>
                  <GameLogTable rows={showLogs} dense />
                  <p className="text-[11px] text-emerald-950/45">
                    {scoringLabel} · Season avg{" "}
                    <span className="font-semibold text-emerald-950">
                      {avg != null ? avg.toFixed(1) : "—"}
                    </span>{" "}
                    FPTS
                  </p>
                  <p className="text-[10px] text-emerald-950/35">
                    ATT / RUSH / TAR / REC show — until usage feeds are wired.
                    FPTS from ESPN/demo week scores.
                  </p>
                </>
              )}
            </div>
          ) : (
            <InsightsFeed
              insight={insight}
              news={news}
              currentWeek={league.currentWeek}
            />
          )}
        </div>

        <div className="border-t border-emerald-950/10 px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {actions}
        </div>
      </div>

      {/* Desktop D1 — wide board */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-board-title"
        className="relative z-10 hidden max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-emerald-950/15 bg-[var(--surface)] shadow-2xl sm:flex"
      >
        <div className="flex items-start justify-between gap-3 border-b border-emerald-950/10 px-4 py-3">
          <div className="min-w-0">
            <h1
              id="player-board-title"
              className="text-xl font-semibold tracking-tight text-emerald-950"
            >
              {player.name}
            </h1>
            <div className="mt-1.5">{headerMeta}</div>
          </div>
          <div className="flex shrink-0 items-start gap-1.5">
            <div className="hidden rounded-md border border-emerald-950/12 bg-emerald-950/[0.04] px-2 py-1 text-center md:block">
              <p className="text-sm font-semibold leading-none text-emerald-950">
                {player.percentOwned.toFixed(0)}%
              </p>
              <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-emerald-950/45">
                Rostered
              </p>
            </div>
            <div className="hidden rounded-md border border-emerald-950/12 bg-emerald-950/[0.04] px-2 py-1 text-center md:block">
              <p className="text-sm font-semibold leading-none text-emerald-950">
                {player.percentStarted.toFixed(0)}%
              </p>
              <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-emerald-950/45">
                Started
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-950/15 text-emerald-950/55 hover:bg-emerald-950/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.65fr_1fr]">
          <div className="min-h-0 overflow-y-auto border-b border-emerald-950/10 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              {yearTabs}
            </div>
            {year !== "current" ? (
              <p className="text-sm text-emerald-950/50">
                No {yearLabel} game log stored yet.
              </p>
            ) : showLogs.length === 0 ? (
              <p className="text-sm text-emerald-950/50">
                No week scores stored for this player yet.
              </p>
            ) : (
              <>
                <GameLogTable rows={showLogs} />
                <p className="mt-1.5 text-[10px] text-emerald-950/35">
                  Usage columns (ATT, RUSH, TAR, …) reserved — FPTS from
                  ESPN/demo. Sticky purple wash marks fantasy points.
                </p>
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden p-4">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-emerald-950/40">
              Latest insights
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <InsightsFeed
                insight={insight}
                news={news}
                currentWeek={league.currentWeek}
              />
            </div>
            <div className="mt-3 border-t border-emerald-950/10 pt-2.5">
              {actions}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
