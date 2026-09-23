"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";
import type { FantasyPlayer, FantasyTeam, PlayerTrendView } from "@/lib/types";
import {
  analyzeTrade,
  comparePlayerPackages,
  type AcceptanceLean,
  type TradeAnalysis,
  type TradeVerdict,
} from "@/lib/insights/trade-analyzer";
import { chipValue } from "@/lib/insights/trade-value";
import { sortByEspnRosterOrder } from "@/lib/roster-order";
import { Button } from "@/components/ui/button";

const VERDICT_STYLE: Record<TradeVerdict, string> = {
  accept: "bg-emerald-700 text-white",
  lean_accept: "bg-emerald-600 text-white",
  fair: "bg-stone-700 text-white",
  lean_reject: "bg-orange-700 text-white",
  hard_reject: "bg-red-800 text-white",
};

const LEAN_STYLE: Record<AcceptanceLean, string> = {
  none: "text-red-800",
  low: "text-orange-700",
  medium: "text-amber-700",
  high: "text-emerald-700",
};

function sortRoster(roster: FantasyPlayer[]): FantasyPlayer[] {
  return sortByEspnRosterOrder(roster);
}

function PlayerPickRow({
  player,
  selected,
  onToggle,
  chip,
}: {
  player: FantasyPlayer;
  selected: boolean;
  onToggle: () => void;
  chip: number;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 border-b border-emerald-950/5 py-2.5 last:border-0 transition",
        selected ? "bg-orange-50/70" : "hover:bg-emerald-950/[0.03]",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-orange-600"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-emerald-950">
            {player.name}
          </span>
          <span className="type-caption text-emerald-950/50">
            {player.position} · {player.nflTeam}
          </span>
          {player.injuryStatus !== "ACTIVE" && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                statusColor(player.injuryStatus),
              )}
            >
              {formatStatusCode(player.injuryStatus)}
            </span>
          )}
        </div>
        <div className="mt-0.5 type-caption text-emerald-950/45">
          proj {player.projectedPoints.toFixed(1)}
          {player.isStarter ? " · starter" : " · bench"}
        </div>
      </div>
      <div className="text-right type-caption text-emerald-950/50">
        <div className="type-stat text-base leading-none text-emerald-950">
          {chip.toFixed(1)}
        </div>
        <div>chip</div>
      </div>
    </label>
  );
}

function AnalysisCard({ analysis }: { analysis: TradeAnalysis }) {
  return (
    <article
      className={cn(
        "animate-fade-up rounded-xl border border-emerald-950/8 border-l-4 py-4 pl-4 pr-3 shadow-sm",
        analysis.verdict === "hard_reject"
          ? "border-l-red-700 bg-red-50/60"
          : analysis.verdict === "lean_reject"
            ? "border-l-orange-500 bg-orange-50/60"
            : analysis.verdict === "fair"
              ? "border-l-stone-400 bg-stone-50/80"
              : "border-l-emerald-600 bg-emerald-50/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider",
            VERDICT_STYLE[analysis.verdict],
          )}
        >
          {analysis.verdictLabel}
        </span>
        <span className="type-eyebrow text-emerald-950/45">
          Full PPR · 1QB redraft
        </span>
      </div>

      <h3 className="type-section mt-2 text-emerald-950">
        {analysis.verdictLabel}
      </h3>
      <p className="type-body mt-1 text-emerald-950/65">{analysis.summary}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="type-eyebrow text-emerald-950/45">You give (chips)</p>
          <p className="type-stat text-3xl text-emerald-950">
            {analysis.giveValue.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="type-eyebrow text-emerald-950/45">You get (chips)</p>
          <p className="type-stat text-3xl text-emerald-950">
            {analysis.receiveValue.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="type-eyebrow text-emerald-950/45">Value gap</p>
          <p
            className={cn(
              "type-stat text-3xl",
              analysis.valueGap >= 0 ? "text-emerald-700" : "text-orange-700",
            )}
          >
            {analysis.valueGap >= 0 ? "+" : ""}
            {analysis.valueGap.toFixed(1)}
          </p>
        </div>
      </div>

      {analysis.hardRejectReasons.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="type-eyebrow text-red-800/70">Hard reject reasons</p>
          {analysis.hardRejectReasons.map((r) => (
            <p key={r} className="type-body text-sm text-red-900/90">
              {r}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="type-eyebrow text-emerald-950/45">For you</p>
          <ul className="mt-1 space-y-1.5">
            {analysis.forYou.map((r) => (
              <li key={r} className="flex gap-2 type-body text-sm text-emerald-950/80">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-600" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="type-eyebrow text-emerald-950/45">For them</p>
          <ul className="mt-1 space-y-1.5">
            {analysis.forThem.map((r) => (
              <li key={r} className="flex gap-2 type-body text-sm text-emerald-950/80">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-500" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4">
        <p className="type-eyebrow text-emerald-950/45">
          Why this would{" "}
          {analysis.verdict === "hard_reject" ||
          analysis.verdict === "lean_reject"
            ? "not "
            : ""}
          get accepted
        </p>
        <p className="type-body mt-1 text-sm text-emerald-950/80">
          {analysis.whyAcceptedOrNot}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-2">
        <p className="type-eyebrow text-emerald-950/45">
          Partner acceptance lean
        </p>
        <span
          className={cn(
            "type-section text-xl",
            LEAN_STYLE[analysis.acceptanceLean],
          )}
        >
          {analysis.acceptanceLeanLabel}
        </span>
        <span className="type-caption text-emerald-950/45">
          (need-fit band — not a win probability)
        </span>
      </div>

      <details className="mt-4 group">
        <summary className="cursor-pointer type-eyebrow text-emerald-950/45 hover:text-emerald-950/70">
          Numbers & takeaway
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="type-eyebrow text-[10px] text-emerald-950/40">
              The numbers
            </p>
            <ul className="mt-1 space-y-1">
              {analysis.facts.map((f) => (
                <li key={f} className="type-caption text-emerald-950/70">
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="type-eyebrow text-[10px] text-emerald-950/40">
              Our take
            </p>
            <ul className="mt-1 space-y-1">
              {analysis.judgments.map((j) => (
                <li key={j} className="type-caption text-emerald-950/70">
                  {j}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </article>
  );
}

export function TradeAnalyzer({
  you,
  partners,
  poolPlayers,
  trends,
  initialPartnerId,
  initialGiveIds = [],
  initialReceiveIds = [],
  isDemo,
}: {
  you: FantasyTeam;
  partners: FantasyTeam[];
  /** Full league + FA pool for free player-vs-player compare mode. */
  poolPlayers?: FantasyPlayer[];
  trends?: Map<number, PlayerTrendView>;
  initialPartnerId?: number;
  initialGiveIds?: string[];
  initialReceiveIds?: string[];
  isDemo?: boolean;
}) {
  const [mode, setMode] = useState<"team" | "free">("team");
  const [partnerId, setPartnerId] = useState<number>(
    initialPartnerId && partners.some((p) => p.id === initialPartnerId)
      ? initialPartnerId
      : partners[0]?.id ?? 0,
  );
  const [giveIds, setGiveIds] = useState<Set<string>>(
    () => new Set(initialGiveIds),
  );
  const [receiveIds, setReceiveIds] = useState<Set<string>>(
    () => new Set(initialReceiveIds),
  );

  const partner = partners.find((p) => p.id === partnerId) ?? partners[0];
  const yourRoster = useMemo(() => sortRoster(you.roster), [you.roster]);
  const theirRoster = useMemo(
    () => sortRoster(partner?.roster ?? []),
    [partner],
  );
  const freePool = useMemo(() => {
    const raw = poolPlayers?.length
      ? poolPlayers
      : [...you.roster, ...partners.flatMap((t) => t.roster)];
    const seen = new Set<string>();
    const unique: FantasyPlayer[] = [];
    for (const p of raw) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      unique.push(p);
    }
    return sortRoster(unique);
  }, [poolPlayers, you.roster, partners]);

  const give = useMemo(() => {
    const source = mode === "team" ? yourRoster : freePool;
    return source.filter((p) => giveIds.has(p.id));
  }, [mode, yourRoster, freePool, giveIds]);

  const receive = useMemo(() => {
    const source = mode === "team" ? theirRoster : freePool;
    return source.filter((p) => receiveIds.has(p.id));
  }, [mode, theirRoster, freePool, receiveIds]);

  const analysis = useMemo(() => {
    if (mode === "free") {
      return comparePlayerPackages(give, receive, trends);
    }
    if (!partner) return null;
    return analyzeTrade(you, partner, give, receive, trends);
  }, [mode, you, partner, give, receive, trends]);

  function toggleGive(id: string) {
    setGiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        if (mode === "free") {
          setReceiveIds((r) => {
            const nr = new Set(r);
            nr.delete(id);
            return nr;
          });
        }
      }
      return next;
    });
  }

  function toggleReceive(id: string) {
    setReceiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        if (mode === "free") {
          setGiveIds((g) => {
            const ng = new Set(g);
            ng.delete(id);
            return ng;
          });
        }
      }
      return next;
    });
  }

  function clearTrade() {
    setGiveIds(new Set());
    setReceiveIds(new Set());
  }

  function onPartnerChange(id: number) {
    setPartnerId(id);
    setReceiveIds(new Set());
  }

  function switchMode(next: "team" | "free") {
    setMode(next);
    clearTrade();
  }

  if (mode === "team" && (!partners.length || !partner)) {
    return (
      <div className="space-y-4">
        <p className="type-body text-emerald-950/55">
          Need at least one other team in the league to analyze a team trade.
        </p>
        <Button type="button" variant="secondary" onClick={() => switchMode("free")}>
          Open player vs player compare
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div
        className="inline-flex rounded-xl border border-emerald-950/15 bg-[color-mix(in_srgb,var(--surface)_90%,white)] p-1"
        role="tablist"
        aria-label="Trade analyzer mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "team"}
          onClick={() => switchMode("team")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            mode === "team"
              ? "bg-emerald-950 text-white"
              : "text-emerald-950/65 hover:text-emerald-950",
          )}
        >
          Team trade
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "free"}
          onClick={() => switchMode("free")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            mode === "free"
              ? "bg-emerald-950 text-white"
              : "text-emerald-950/65 hover:text-emerald-950",
          )}
        >
          Player vs player
        </button>
      </div>

      {mode === "team" ? (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label
              htmlFor="trade-partner"
              className="type-eyebrow text-emerald-950/45"
            >
              Trade partner
            </label>
            <select
              id="trade-partner"
              value={partnerId}
              onChange={(e) => onPartnerChange(Number(e.target.value))}
              className="mt-1 block w-full min-w-[14rem] rounded-lg border border-emerald-950/15 bg-white px-3 py-2 text-emerald-950 outline-none focus:border-orange-500 sm:w-auto"
            >
              {partners.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.wins}-{t.losses}
                  {t.ties ? `-${t.ties}` : ""})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(give.length > 0 || receive.length > 0) && (
              <Button type="button" variant="ghost" size="sm" onClick={clearTrade}>
                Clear picks
              </Button>
            )}
            <Link
              href="/insights"
              className="text-sm font-semibold text-orange-700 hover:text-orange-800"
            >
              Auto trade ideas →
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="type-body max-w-xl text-sm text-emerald-950/65">
            Pick any players on each side (league-wide). We grade full-PPR chip
            value, hard rejects (no naked quarterback for a skill star), and
            whether a typical manager would reasonably accept.
          </p>
          {(give.length > 0 || receive.length > 0) && (
            <Button type="button" variant="ghost" size="sm" onClick={clearTrade}>
              Clear picks
            </Button>
          )}
        </div>
      )}

      {isDemo && (
        <p className="type-eyebrow text-orange-700">
          Demo league data — guest-friendly
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="animate-fade-up">
          <h2 className="type-section text-emerald-950">
            {mode === "team" ? "You give" : "Side A"}
          </h2>
          <p className="type-body mt-1 text-sm text-emerald-950/55">
            {mode === "team"
              ? `From ${you.name} — select one or more players.`
              : "Players leaving Side A — select one or more."}
          </p>
          <div className="mt-3 max-h-[28rem] overflow-y-auto border-t border-emerald-950/10">
            {(mode === "team" ? yourRoster : freePool).map((p) => (
              <PlayerPickRow
                key={`a-${p.id}`}
                player={p}
                selected={giveIds.has(p.id)}
                onToggle={() => toggleGive(p.id)}
                chip={chipValue(p, trends)}
              />
            ))}
          </div>
        </section>

        <section className="animate-fade-up-delay">
          <h2 className="type-section text-emerald-950">
            {mode === "team" ? "You get" : "Side B"}
          </h2>
          <p className="type-body mt-1 text-sm text-emerald-950/55">
            {mode === "team"
              ? `From ${partner!.name} — select one or more players.`
              : "Players leaving Side B — select one or more."}
          </p>
          <div className="mt-3 max-h-[28rem] overflow-y-auto border-t border-emerald-950/10">
            {(mode === "team" ? theirRoster : freePool).map((p) => (
              <PlayerPickRow
                key={`b-${p.id}`}
                player={p}
                selected={receiveIds.has(p.id)}
                onToggle={() => toggleReceive(p.id)}
                chip={chipValue(p, trends)}
              />
            ))}
          </div>
        </section>
      </div>

      <section className="animate-fade-up-delay-2">
        <h2 className="type-section mb-3 text-emerald-950">Analysis</h2>
        {!analysis ? (
          <p className="type-body text-emerald-950/55">
            Pick at least one player on each side to see a verdict, chip totals,
            hard-reject checks, and{" "}
            {mode === "team"
              ? "need-fit (For you / For them)."
              : "whether a typical partner would accept."}
          </p>
        ) : (
          <AnalysisCard analysis={analysis} />
        )}
      </section>
    </div>
  );
}
