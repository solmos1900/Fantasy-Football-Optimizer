"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, statusColor } from "@/lib/utils";
import type { FantasyPlayer, FantasyTeam, PlayerTrendView } from "@/lib/types";
import {
  analyzeTrade,
  type AcceptanceLean,
  type TradeAnalysis,
  type TradeVerdict,
} from "@/lib/insights/trade-analyzer";
import { chipValue } from "@/lib/insights/trade-value";
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
  const order = ["QB", "RB", "WR", "TE", "K", "D/ST"];
  return [...roster].sort((a, b) => {
    const ai = order.indexOf(a.position);
    const bi = order.indexOf(b.position);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.projectedPoints - a.projectedPoints;
  });
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
              {player.injuryStatus}
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
          Facts vs judgment
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="type-eyebrow text-[10px] text-emerald-950/40">Facts</p>
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
              Judgment
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
  trends,
  initialPartnerId,
  initialGiveIds = [],
  initialReceiveIds = [],
  isDemo,
}: {
  you: FantasyTeam;
  partners: FantasyTeam[];
  trends?: Map<number, PlayerTrendView>;
  initialPartnerId?: number;
  initialGiveIds?: string[];
  initialReceiveIds?: string[];
  isDemo?: boolean;
}) {
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
    () => (partner ? sortRoster(partner.roster) : []),
    [partner],
  );

  const give = useMemo(
    () => yourRoster.filter((p) => giveIds.has(p.id)),
    [yourRoster, giveIds],
  );
  const receive = useMemo(
    () => theirRoster.filter((p) => receiveIds.has(p.id)),
    [theirRoster, receiveIds],
  );

  const analysis = useMemo(() => {
    if (!partner) return null;
    return analyzeTrade(you, partner, give, receive, trends);
  }, [you, partner, give, receive, trends]);

  function toggleGive(id: string) {
    setGiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleReceive(id: string) {
    setReceiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  if (!partners.length || !partner) {
    return (
      <p className="type-body text-emerald-950/55">
        Need at least one other team in the league to analyze a trade.
      </p>
    );
  }

  return (
    <div className="space-y-8">
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

      {isDemo && (
        <p className="type-eyebrow text-orange-700">
          Demo league data — guest-friendly
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="animate-fade-up">
          <h2 className="type-section text-emerald-950">You give</h2>
          <p className="type-body mt-1 text-sm text-emerald-950/55">
            From {you.name} — select one or more players.
          </p>
          <div className="mt-3 max-h-[28rem] overflow-y-auto border-t border-emerald-950/10">
            {yourRoster.map((p) => (
              <PlayerPickRow
                key={p.id}
                player={p}
                selected={giveIds.has(p.id)}
                onToggle={() => toggleGive(p.id)}
                chip={chipValue(p, trends)}
              />
            ))}
          </div>
        </section>

        <section className="animate-fade-up-delay">
          <h2 className="type-section text-emerald-950">You get</h2>
          <p className="type-body mt-1 text-sm text-emerald-950/55">
            From {partner.name} — select one or more players.
          </p>
          <div className="mt-3 max-h-[28rem] overflow-y-auto border-t border-emerald-950/10">
            {theirRoster.map((p) => (
              <PlayerPickRow
                key={p.id}
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
            hard-reject checks, and need-fit (For you / For them).
          </p>
        ) : (
          <AnalysisCard analysis={analysis} />
        )}
      </section>
    </div>
  );
}
