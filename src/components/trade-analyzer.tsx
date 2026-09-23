"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";
import type { FantasyPlayer, FantasyTeam, PlayerTrendView } from "@/lib/types";
import {
  analyzeTrade,
  comparePlayerPackages,
  type TradeAnalysis,
  type TradeVerdict,
} from "@/lib/insights/trade-analyzer";
import { chipValue } from "@/lib/insights/trade-value";
import { sortByEspnRosterOrder } from "@/lib/roster-order";
import { Button } from "@/components/ui/button";

type TradeStep = "yours" | "theirs" | "results";
type TradeMode = "team" | "free";

const STEPS: { id: TradeStep; label: string }[] = [
  { id: "yours", label: "Your side" },
  { id: "theirs", label: "Their side" },
  { id: "results", label: "Results" },
];

const VERDICT_STYLE: Record<TradeVerdict, string> = {
  accept: "bg-emerald-700 text-white",
  lean_accept: "bg-emerald-600 text-white",
  fair: "bg-stone-700 text-white",
  lean_reject: "bg-orange-700 text-white",
  hard_reject: "bg-red-800 text-white",
};

function sortRoster(roster: FantasyPlayer[]): FantasyPlayer[] {
  return sortByEspnRosterOrder(roster);
}

function playerNames(players: FantasyPlayer[]): string {
  if (!players.length) return "None selected";
  return players.map((p) => p.name).join(" + ");
}

function shortRejectReason(analysis: TradeAnalysis): string {
  if (analysis.hardRejectReasons.length > 0) {
    return analysis.hardRejectReasons[0];
  }
  return analysis.whyAcceptedOrNot || analysis.summary;
}

function whoBenefitsCopy(
  analysis: TradeAnalysis,
  mode: TradeMode,
): { headline: string; detail: string } {
  const gap = analysis.valueGap;

  if (Math.abs(gap) < 0.5) {
    return {
      headline: "Roughly even",
      detail:
        mode === "team"
          ? "You and your partner swap about the same value."
          : "Both sides swap about the same value.",
    };
  }
  if (gap > 0) {
    return {
      headline: mode === "team" ? "You win this deal" : "Side A wins this deal",
      detail: `Ahead by ${gap.toFixed(1)} points of value.`,
    };
  }
  return {
    headline: mode === "team" ? "They win this deal" : "Side B wins this deal",
    detail: `Ahead by ${Math.abs(gap).toFixed(1)} points of value.`,
  };
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
        <div>val</div>
      </div>
    </label>
  );
}

function StepRail({
  step,
  onJump,
  canReachTheirs,
  canReachResults,
}: {
  step: TradeStep;
  onJump: (next: TradeStep) => void;
  canReachTheirs: boolean;
  canReachResults: boolean;
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <nav aria-label="Trade steps" className="animate-fade-up">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((s, index) => {
          const isCurrent = s.id === step;
          const isDone = index < currentIndex;
          const canJump =
            s.id === "yours" ||
            (s.id === "theirs" && canReachTheirs) ||
            (s.id === "results" && canReachResults);
          return (
            <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={!canJump || isCurrent}
                onClick={() => onJump(s.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition",
                  isCurrent
                    ? "bg-emerald-950 text-white"
                    : isDone
                      ? "bg-emerald-950/10 text-emerald-950 hover:bg-emerald-950/15"
                      : "bg-emerald-950/[0.04] text-emerald-950/40",
                  !canJump && !isCurrent && "cursor-not-allowed opacity-60",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    isCurrent
                      ? "bg-white/15 text-white"
                      : isDone
                        ? "bg-emerald-950 text-white"
                        : "bg-emerald-950/10 text-emerald-950/50",
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                </span>
                <span className="type-eyebrow truncate tracking-wider">
                  {s.label}
                </span>
              </button>
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "hidden h-px w-3 shrink-0 sm:block",
                    index < currentIndex ? "bg-emerald-950/40" : "bg-emerald-950/15",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SelectedSummary({
  label,
  players,
}: {
  label: string;
  players: FantasyPlayer[];
}) {
  return (
    <div className="rounded-xl border border-emerald-950/10 bg-[color-mix(in_srgb,var(--surface)_92%,white)] px-3 py-2.5">
      <p className="type-eyebrow text-emerald-950/45">{label}</p>
      <p className="type-body mt-1 text-sm font-medium text-emerald-950">
        {playerNames(players)}
      </p>
    </div>
  );
}

function LeanResultsCard({
  analysis,
  mode,
}: {
  analysis: TradeAnalysis;
  mode: TradeMode;
}) {
  const reason = shortRejectReason(analysis);
  const benefit = whoBenefitsCopy(analysis, mode);
  const giveLabel = mode === "team" ? "You give" : "Side A";
  const getLabel = mode === "team" ? "You get" : "Side B";

  return (
    <article
      className={cn(
        "animate-fade-up surface-card border-l-4 py-5 pl-4 pr-4",
        analysis.verdict === "hard_reject"
          ? "border-l-red-700"
          : analysis.verdict === "lean_reject"
            ? "border-l-orange-500"
            : analysis.verdict === "fair"
              ? "border-l-stone-400"
              : "border-l-emerald-600",
      )}
    >
      <span
        className={cn(
          "stamp animate-stamp",
          analysis.verdict === "hard_reject" || analysis.verdict === "lean_reject"
            ? "stamp-start"
            : analysis.verdict === "fair"
              ? "stamp-flex"
              : "stamp-sit",
          VERDICT_STYLE[analysis.verdict],
        )}
      >
        {analysis.verdictLabel}
      </span>

      <p className="type-body mt-3 text-emerald-950/80">{reason}</p>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-emerald-950/10 pt-4">
        <div>
          <p className="type-eyebrow text-emerald-950/45">{giveLabel}</p>
          <p className="type-stat mt-1 text-2xl text-emerald-950 sm:text-3xl">
            {analysis.giveValue.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="type-eyebrow text-emerald-950/45">{getLabel}</p>
          <p className="type-stat mt-1 text-2xl text-emerald-950 sm:text-3xl">
            {analysis.receiveValue.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="type-eyebrow text-emerald-950/45">Difference</p>
          <p
            className={cn(
              "type-stat mt-1 text-2xl sm:text-3xl",
              analysis.valueGap >= 0 ? "text-emerald-700" : "text-orange-700",
            )}
          >
            {analysis.valueGap >= 0 ? "+" : ""}
            {analysis.valueGap.toFixed(1)}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-emerald-950/10 pt-4">
        <p className="type-eyebrow text-emerald-950/45">Who benefits</p>
        <p className="type-section mt-1 text-emerald-950">{benefit.headline}</p>
        <p className="type-body mt-1 text-sm text-emerald-950/65">
          {benefit.detail}
        </p>
      </div>
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
  const hasDeepLinkBothSides =
    initialGiveIds.length > 0 && initialReceiveIds.length > 0;

  const [mode, setMode] = useState<TradeMode>("team");
  const [step, setStep] = useState<TradeStep>(() =>
    hasDeepLinkBothSides ? "results" : "yours",
  );
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

  const canReachTheirs = give.length > 0;
  const canReachResults = give.length > 0 && receive.length > 0 && !!analysis;

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
    setStep("yours");
  }

  function onPartnerChange(id: number) {
    setPartnerId(id);
    setReceiveIds(new Set());
    if (step === "results") setStep("theirs");
  }

  function switchMode(next: TradeMode) {
    setMode(next);
    setGiveIds(new Set());
    setReceiveIds(new Set());
    setStep("yours");
  }

  function jumpTo(next: TradeStep) {
    if (next === "theirs" && !canReachTheirs) return;
    if (next === "results" && !canReachResults) return;
    setStep(next);
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
    <div className="space-y-6">
      <StepRail
        step={step}
        onJump={jumpTo}
        canReachTheirs={canReachTheirs}
        canReachResults={canReachResults}
      />

      {step !== "results" && (
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
      )}

      {isDemo && step !== "results" && (
        <p className="type-eyebrow text-orange-700">
          Demo league data — guest-friendly
        </p>
      )}

      {step === "yours" && (
        <section className="animate-fade-up space-y-5">
          {mode === "team" ? (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
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
                  className="field-input mt-1 block w-full min-w-[14rem] sm:w-auto"
                >
                  {partners.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.wins}-{t.losses}
                      {t.ties ? `-${t.ties}` : ""})
                    </option>
                  ))}
                </select>
              </div>
              <Link
                href="/insights"
                className="text-sm font-semibold text-orange-700 hover:text-orange-800"
              >
                Auto trade ideas →
              </Link>
            </div>
          ) : (
            <p className="type-body max-w-xl text-sm text-emerald-950/65">
              Pick who leaves your side. Next you&apos;ll choose who comes back.
            </p>
          )}

          <div>
            <h2 className="type-section text-emerald-950">
              {mode === "team" ? "You give" : "Side A"}
            </h2>
            <p className="type-body mt-1 text-sm text-emerald-950/55">
              {mode === "team"
                ? `From ${you.name} — select one or more players.`
                : "Select one or more players leaving Side A."}
            </p>
            <div className="mt-3 max-h-[min(28rem,55vh)] overflow-y-auto border-t border-emerald-950/10">
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
          </div>

          {give.length > 0 && (
            <SelectedSummary
              label={mode === "team" ? "Selected — you give" : "Selected — Side A"}
              players={give}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emerald-950/10 pt-4">
            {(give.length > 0 || receive.length > 0) && (
              <Button type="button" variant="ghost" size="sm" onClick={clearTrade}>
                Clear picks
              </Button>
            )}
            <Button
              type="button"
              className="ml-auto"
              disabled={!canReachTheirs}
              onClick={() => setStep("theirs")}
            >
              Select their side
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </section>
      )}

      {step === "theirs" && (
        <section className="animate-fade-up space-y-5">
          <SelectedSummary
            label={mode === "team" ? "You give" : "Side A"}
            players={give}
          />

          {mode === "team" && (
            <div>
              <label
                htmlFor="trade-partner-step-b"
                className="type-eyebrow text-emerald-950/45"
              >
                Trade partner
              </label>
              <select
                id="trade-partner-step-b"
                value={partnerId}
                onChange={(e) => onPartnerChange(Number(e.target.value))}
                className="field-input mt-1 block w-full min-w-[14rem] sm:w-auto"
              >
                {partners.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.wins}-{t.losses}
                    {t.ties ? `-${t.ties}` : ""})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <h2 className="type-section text-emerald-950">
              {mode === "team" ? "You get" : "Side B"}
            </h2>
            <p className="type-body mt-1 text-sm text-emerald-950/55">
              {mode === "team"
                ? `From ${partner!.name} — select one or more players.`
                : "Select one or more players leaving Side B."}
            </p>
            <div className="mt-3 max-h-[min(28rem,55vh)] overflow-y-auto border-t border-emerald-950/10">
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
          </div>

          {receive.length > 0 && (
            <SelectedSummary
              label={mode === "team" ? "Selected — you get" : "Selected — Side B"}
              players={receive}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emerald-950/10 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep("yours")}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Adjust your side
            </Button>
            <Button
              type="button"
              disabled={!canReachResults}
              onClick={() => setStep("results")}
            >
              See results
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </section>
      )}

      {step === "results" && analysis && (
        <section className="space-y-5">
          <div className="animate-fade-up space-y-2">
            <SelectedSummary
              label={mode === "team" ? "You give" : "Side A"}
              players={give}
            />
            <SelectedSummary
              label={mode === "team" ? "You get" : "Side B"}
              players={receive}
            />
          </div>

          <LeanResultsCard analysis={analysis} mode={mode} />

          <div className="flex flex-wrap items-center gap-3 border-t border-emerald-950/10 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("yours")}
            >
              Adjust your side
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("theirs")}
            >
              Adjust their side
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:ml-auto"
              onClick={clearTrade}
            >
              Start over
            </Button>
          </div>
        </section>
      )}

      {step === "results" && !analysis && (
        <section className="animate-fade-up space-y-4">
          <p className="type-body text-emerald-950/65">
            Pick at least one player on each side to see results.
          </p>
          <Button type="button" onClick={() => setStep("yours")}>
            Back to your side
          </Button>
        </section>
      )}
    </div>
  );
}
