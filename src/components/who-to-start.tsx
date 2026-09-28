"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";
import type {
  FantasyPlayer,
  FantasyTeam,
  LeagueData,
  PlayerPosition,
  PlayerTrendView,
} from "@/lib/types";
import {
  compareWhoToStart,
  samePositionSuggestions,
  type WhoToStartResult,
  type WhoToStartVerdict,
} from "@/lib/insights/who-to-start";
import { Button } from "@/components/ui/button";

export type TrendsProp =
  | Map<number, PlayerTrendView>
  | Record<string, PlayerTrendView>
  | undefined;

/** START = brand purple; lean = warning; toss-up = muted chrome. */
const VERDICT_STYLE: Record<WhoToStartVerdict, string> = {
  start_a: "bg-brand text-white",
  start_b: "bg-brand text-white",
  lean_a: "bg-warning text-[#0b0b0b]",
  lean_b: "bg-warning text-[#0b0b0b]",
  toss_up: "bg-[#353535] text-emerald-950 ring-1 ring-emerald-950/20",
};

function matchesPlayerQuery(player: FantasyPlayer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    player.name.toLowerCase().includes(q) ||
    player.nflTeam.toLowerCase().includes(q) ||
    player.position.toLowerCase().includes(q)
  );
}

function SinglePlayerSearch({
  label,
  sideLetter,
  pool,
  selected,
  blockedId,
  positionLock,
  onSelect,
  onClear,
}: {
  label: string;
  sideLetter: "A" | "B";
  pool: FantasyPlayer[];
  selected: FantasyPlayer | null;
  blockedId: string | null;
  /** When set, only same-position players are selectable. */
  positionLock: PlayerPosition | null;
  onSelect: (player: FantasyPlayer) => void;
  onClear: () => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return [];
    return pool
      .filter((p) => p.id !== blockedId)
      .filter((p) => !selected || p.id !== selected.id)
      .filter((p) => !positionLock || p.position === positionLock)
      .filter((p) => matchesPlayerQuery(p, q))
      .sort((a, b) => b.projectedPoints - a.projectedPoints)
      .slice(0, 8);
  }, [pool, query, selected, blockedId, positionLock]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function pick(player: FantasyPlayer) {
    if (blockedId === player.id) return;
    if (positionLock && player.position !== positionLock) return;
    onSelect(player);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="type-eyebrow text-emerald-950/45">
          Player {sideLetter} · {label}
        </p>
        {positionLock && (
          <p className="type-caption text-emerald-950/45">
            {positionLock} only
          </p>
        )}
      </div>

      {selected ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-950/12 bg-[var(--kraft)] px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-emerald-950">
                {selected.name}
              </span>
              <span className="type-caption text-emerald-950/50">
                {selected.position} · {selected.nflTeam}
              </span>
              {selected.injuryStatus !== "ACTIVE" && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    statusColor(selected.injuryStatus),
                  )}
                >
                  {formatStatusCode(selected.injuryStatus)}
                </span>
              )}
            </div>
            <p className="mt-0.5 type-caption text-emerald-950/45">
              proj {selected.projectedPoints.toFixed(1)}
              {selected.opponent ? ` · ${selected.opponent}` : ""}
              {selected.isStarter ? " · starter" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-950/55 transition hover:bg-emerald-950/10 hover:text-emerald-950"
            aria-label={`Clear ${selected.name}`}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <label className="block">
            <span className="sr-only">{label}</span>
            <input
              type="search"
              value={query}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={open && query.trim().length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              placeholder={
                positionLock
                  ? `Type a ${positionLock} name…`
                  : "Type a player name…"
              }
              className="field-input"
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Enter" && suggestions[0]) {
                  e.preventDefault();
                  pick(suggestions[0]);
                }
              }}
            />
          </label>

          {open && query.trim().length === 0 && (
            <p className="type-body text-sm text-emerald-950/55">
              Start typing to search the league player pool
              {positionLock ? ` (${positionLock} only)` : ""}.
            </p>
          )}

          {open && query.trim().length > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Matching players"
              className="overflow-hidden rounded-xl border border-emerald-950/12 bg-[var(--surface)] shadow-sm"
            >
              {suggestions.length === 0 ? (
                <li className="px-3 py-3 type-body text-sm text-emerald-950/55">
                  {positionLock
                    ? `No ${positionLock} matches “${query.trim()}”.`
                    : `No players match “${query.trim()}”.`}
                </li>
              ) : (
                suggestions.map((player) => (
                  <li key={player.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => pick(player)}
                      className="flex w-full items-center gap-3 border-b border-emerald-950/5 px-3 py-2.5 text-left last:border-0 transition hover:bg-orange-50/70"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-emerald-950">
                            {player.name}
                          </span>
                          <span className="type-caption text-emerald-950/50">
                            {player.position} · {player.nflTeam}
                          </span>
                        </div>
                        <div className="mt-0.5 type-caption text-emerald-950/45">
                          proj {player.projectedPoints.toFixed(1)}
                        </div>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function VerdictCard({ result }: { result: WhoToStartResult }) {
  return (
    <article
      className={cn(
        "animate-fade-up surface-card border-l-4 py-5 pl-4 pr-4",
        result.verdict === "toss_up"
          ? "border-l-stone-400"
          : result.verdict.startsWith("lean")
            ? "border-l-amber-500"
            : "border-l-orange-600",
      )}
    >
      <span
        className={cn(
          "stamp animate-stamp",
          result.verdict === "toss_up" ? "stamp-flex" : "stamp-start",
          VERDICT_STYLE[result.verdict],
        )}
      >
        {result.verdictLabel}
      </span>

      <h2 className="type-section mt-3 text-emerald-950">{result.headline}</h2>
      <p className="type-body mt-2 text-emerald-950/80">{result.summary}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-emerald-950/10 pt-4">
        <div>
          <p className="type-eyebrow text-emerald-950/45">A · proj</p>
          <p className="type-stat mt-1 text-2xl text-emerald-950 sm:text-3xl">
            {result.sideA.projectedPoints.toFixed(1)}
          </p>
          <p className="type-caption mt-1 text-emerald-950/45">
            {result.playerA.name}
          </p>
        </div>
        <div>
          <p className="type-eyebrow text-emerald-950/45">B · proj</p>
          <p className="type-stat mt-1 text-2xl text-emerald-950 sm:text-3xl">
            {result.sideB.projectedPoints.toFixed(1)}
          </p>
          <p className="type-caption mt-1 text-emerald-950/45">
            {result.playerB.name}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-emerald-950/10 pt-4">
        <p className="type-eyebrow text-emerald-950/45">Why</p>
        <ul className="mt-2 space-y-2">
          {result.reasons.map((reason) => (
            <li
              key={reason}
              className="type-body text-sm leading-snug text-emerald-950/75"
            >
              {reason}
            </li>
          ))}
        </ul>
        {result.dataThin && (
          <p className="type-caption mt-3 text-orange-700">
            Thin sample on form and/or defense comps — edge is softer.
          </p>
        )}
      </div>
    </article>
  );
}

export function WhoToStart({
  league,
  you,
  poolPlayers,
  trends: trendsProp,
  isDemo,
}: {
  league: LeagueData;
  you: FantasyTeam;
  poolPlayers: FantasyPlayer[];
  trends?: TrendsProp;
  isDemo?: boolean;
}) {
  const [playerA, setPlayerA] = useState<FantasyPlayer | null>(null);
  const [playerB, setPlayerB] = useState<FantasyPlayer | null>(null);

  const pool = useMemo(() => {
    const seen = new Set<string>();
    const unique: FantasyPlayer[] = [];
    for (const p of poolPlayers) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      unique.push(p);
    }
    return unique.sort((a, b) => b.projectedPoints - a.projectedPoints);
  }, [poolPlayers]);

  const positionLock: PlayerPosition | null =
    playerA?.position ?? playerB?.position ?? null;

  const suggestions = useMemo(() => {
    if (!positionLock) {
      // Default: show a few of your starters as kickoff ideas.
      return you.roster
        .filter((p) => p.isStarter && p.slot !== "IR")
        .sort((a, b) => b.projectedPoints - a.projectedPoints)
        .slice(0, 6);
    }
    const exclude = new Set<string>();
    if (playerA) exclude.add(playerA.id);
    if (playerB) exclude.add(playerB.id);
    return samePositionSuggestions(you, positionLock, exclude).slice(0, 8);
  }, [you, positionLock, playerA, playerB]);

  const comparison = useMemo(() => {
    if (!playerA || !playerB) return null;
    return compareWhoToStart(league, playerA, playerB, trendsProp);
  }, [league, playerA, playerB, trendsProp]);

  function selectA(player: FantasyPlayer) {
    if (playerB && playerB.position !== player.position) {
      setPlayerB(null);
    }
    if (playerB?.id === player.id) setPlayerB(null);
    setPlayerA(player);
  }

  function selectB(player: FantasyPlayer) {
    if (playerA && playerA.position !== player.position) {
      setPlayerA(null);
    }
    if (playerA?.id === player.id) setPlayerA(null);
    setPlayerB(player);
  }

  function quickPick(player: FantasyPlayer) {
    if (!playerA) {
      selectA(player);
      return;
    }
    if (!playerB) {
      if (player.id === playerA.id) return;
      if (player.position !== playerA.position) {
        // Switch lock to this player's position and start over with A.
        setPlayerB(null);
        setPlayerA(player);
        return;
      }
      selectB(player);
      return;
    }
    // Both filled — replace B if same pos, else reset to A.
    if (player.position === playerA.position && player.id !== playerA.id) {
      selectB(player);
    } else {
      setPlayerB(null);
      setPlayerA(player);
    }
  }

  function clearAll() {
    setPlayerA(null);
    setPlayerB(null);
  }

  const positionMismatch =
    playerA && playerB && playerA.position !== playerB.position;

  return (
    <div className="space-y-6">
      {isDemo && (
        <p className="type-eyebrow text-orange-700">
          Demo league data — guest-friendly
        </p>
      )}

      <p className="type-body max-w-2xl text-sm text-emerald-950/65">
        Pick two players at the same position. We weigh this week&apos;s
        projection, recent form, injury status, and defense matchup — no LLM,
        no invented comps.
      </p>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="type-eyebrow text-emerald-950/45">
            {positionLock
              ? `From your ${positionLock}s`
              : "From your starters"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => quickPick(p)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-emerald-950/15 bg-[var(--kraft)] px-2.5 py-1.5 text-left text-sm font-medium text-emerald-950 transition hover:border-orange-600/45 hover:bg-orange-50/40"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="type-caption shrink-0 text-emerald-950/45">
                    {p.position}
                    {p.isStarter ? " · S" : " · BN"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="surface-card space-y-3 p-4 sm:p-5">
          <SinglePlayerSearch
            label="Search league pool"
            sideLetter="A"
            pool={pool}
            selected={playerA}
            blockedId={playerB?.id ?? null}
            positionLock={playerB && !playerA ? playerB.position : null}
            onSelect={selectA}
            onClear={() => setPlayerA(null)}
          />
        </section>
        <section className="surface-card space-y-3 p-4 sm:p-5">
          <SinglePlayerSearch
            label="Search league pool"
            sideLetter="B"
            pool={pool}
            selected={playerB}
            blockedId={playerA?.id ?? null}
            positionLock={playerA && !playerB ? playerA.position : null}
            onSelect={selectB}
            onClear={() => setPlayerB(null)}
          />
        </section>
      </div>

      {(playerA || playerB) && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            Clear both
          </Button>
          {positionLock && (
            <p className="type-caption text-emerald-950/50">
              Comparing {positionLock}s
            </p>
          )}
        </div>
      )}

      {positionMismatch && (
        <p
          role="alert"
          className="rounded-xl border border-orange-600/30 bg-orange-50/40 px-3 py-2.5 type-body text-sm text-orange-800"
        >
          Same position only — {playerA!.name} is {playerA!.position} and{" "}
          {playerB!.name} is {playerB!.position}. Clear one pick to continue.
        </p>
      )}

      {comparison && !comparison.ok && (
        <p
          role="alert"
          className="rounded-xl border border-orange-600/30 bg-orange-50/40 px-3 py-2.5 type-body text-sm text-orange-800"
        >
          {comparison.message}
        </p>
      )}

      {comparison?.ok && <VerdictCard result={comparison} />}

      {!playerA && !playerB && (
        <p className="type-body text-sm text-emerald-950/55">
          Type to search, or tap a starter above to begin.
        </p>
      )}

      {playerA && !playerB && !positionMismatch && (
        <p className="type-body text-sm text-emerald-950/55">
          Now pick another {playerA.position} to compare.
        </p>
      )}
    </div>
  );
}
