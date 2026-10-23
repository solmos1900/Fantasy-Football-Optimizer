"use client";

import { PendingLink } from "@/components/pending-link";
import { dashNum } from "@/components/chat/format-metric";
import { MiniSparkline } from "@/components/chat/sparkline";
import { cn } from "@/lib/utils";
import type { ChatPlayerMetricCard } from "@/lib/chat/tool-runners";

function InjuryBadge({ card }: { card: ChatPlayerMetricCard }) {
  if (!card.injuryLabel) return null;
  const serious =
    card.injuryStatus === "OUT" ||
    card.injuryStatus === "IR" ||
    card.injuryStatus === "SUSPENSION" ||
    card.injuryStatus === "DOUBTFUL";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
        serious
          ? "bg-danger/20 text-[color-mix(in_srgb,var(--danger)_70%,white)]"
          : "bg-warning/20 text-[color-mix(in_srgb,var(--warning)_70%,white)]",
      )}
    >
      {card.injuryStatus}
    </span>
  );
}

function PlayerStatCard({ card }: { card: ChatPlayerMetricCard }) {
  return (
    <div className="min-w-0 rounded-lg border border-emerald-950/12 bg-[color-mix(in_srgb,var(--kraft)_70%,transparent)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-emerald-950">
            {card.label}
          </p>
          <p className="type-caption text-emerald-950/50">
            {card.position}
            {card.byeThisWeek
              ? " · bye this week"
              : card.opponent
                ? ` · ${card.opponent}`
                : ""}
          </p>
        </div>
        <InjuryBadge card={card} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <Metric label="Season PPG" value={dashNum(card.seasonPpg)} />
        <Metric label="Last 3 games" value={dashNum(card.last3Avg)} />
        <Metric
          label="This week proj"
          value={card.byeThisWeek ? "BYE" : dashNum(card.sleeperProj)}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <MiniSparkline points={card.spark} />
        {card.formLine ? (
          <p className="type-caption line-clamp-2 flex-1 text-right text-emerald-950/55">
            {card.formLine}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-caption text-[10px] text-emerald-950/45">{label}</p>
      <p className="type-stat text-base text-emerald-950">{value}</p>
    </div>
  );
}

function FreshnessLine({
  label,
  warning,
}: {
  label: string;
  warning?: string | null;
}) {
  return (
    <div className="mt-2 space-y-1">
      <p className="type-caption text-emerald-950/45">{label}</p>
      {warning ? (
        <p className="text-xs font-medium text-warning">{warning}</p>
      ) : null}
    </div>
  );
}

export function ChatToolResultView({ output }: { output: unknown }) {
  if (!output || typeof output !== "object") return null;
  const data = output as Record<string, unknown>;

  if (data.kind === "league-gate") {
    return (
      <div className="rounded-lg border border-orange-500/30 bg-orange-50/40 px-3 py-3">
        <p className="text-sm font-semibold text-emerald-950">
          Connect a league to unlock
        </p>
        <p className="mt-1 text-sm text-emerald-950/65">
          {String(data.message ?? "")}
        </p>
        <PendingLink
          href={String(data.connectHref ?? "/connect#espn")}
          className="mt-2 inline-block text-sm font-semibold text-orange-700 hover:text-orange-800"
        >
          How to connect →
        </PendingLink>
      </div>
    );
  }

  if (data.ok === false) {
    return (
      <div className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-emerald-950">
        {String(data.message ?? "Could not complete that request.")}
      </div>
    );
  }

  if (data.kind === "trade" && data.ok === true) {
    const sideA = (data.sideA as ChatPlayerMetricCard[]) ?? [];
    const sideB = (data.sideB as ChatPlayerMetricCard[]) ?? [];
    const freshness = data.freshness as
      | { label: string; warning: string | null }
      | undefined;
    const winner = data.winner as string;
    const edgeClass =
      winner === "even"
        ? "text-emerald-950"
        : "text-[color-mix(in_srgb,var(--success)_80%,white)]";
    return (
      <div className="space-y-3">
        <div>
          <p className={cn("text-sm font-semibold", edgeClass)}>
            {String(data.headline)}
          </p>
          <p className="type-caption mt-0.5 text-emerald-950/50">
            Side A {dashNum(data.giveValue as number)} · Side B{" "}
            {dashNum(data.receiveValue as number)} · {String(data.differenceLabel)}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="type-eyebrow text-orange-700">Left / Side A</p>
            {sideA.map((c) => (
              <PlayerStatCard key={c.espnId} card={c} />
            ))}
          </div>
          <div className="space-y-2">
            <p className="type-eyebrow text-orange-700">Right / Side B</p>
            {sideB.map((c) => (
              <PlayerStatCard key={c.espnId} card={c} />
            ))}
          </div>
        </div>
        {freshness ? (
          <FreshnessLine label={freshness.label} warning={freshness.warning} />
        ) : null}
      </div>
    );
  }

  if (data.kind === "who-to-start" && data.ok === true) {
    const players = (data.players as ChatPlayerMetricCard[]) ?? [];
    const freshness = data.freshness as
      | { label: string; warning: string | null }
      | undefined;
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-[color-mix(in_srgb,var(--success)_85%,white)]">
          {String(data.headline)}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {players.map((c) => (
            <PlayerStatCard key={c.espnId} card={c} />
          ))}
        </div>
        {Array.isArray(data.reasons) && data.reasons.length > 0 ? (
          <ul className="space-y-1 text-xs text-emerald-950/60">
            {(data.reasons as string[]).slice(0, 3).map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        ) : null}
        {freshness ? (
          <FreshnessLine label={freshness.label} warning={freshness.warning} />
        ) : null}
      </div>
    );
  }

  if (
    (data.kind === "outlook" || data.kind === "waiver") &&
    data.ok === true &&
    data.player
  ) {
    const freshness = data.freshness as
      | { label: string; warning: string | null }
      | undefined;
    return (
      <div className="space-y-2">
        <PlayerStatCard card={data.player as ChatPlayerMetricCard} />
        {typeof data.staleNotice === "string" && data.staleNotice ? (
          <p className="text-xs font-medium text-warning">{data.staleNotice}</p>
        ) : null}
        {freshness ? (
          <FreshnessLine label={freshness.label} warning={freshness.warning} />
        ) : null}
      </div>
    );
  }

  if (data.kind === "roster" && data.ok === true) {
    const players = (data.players as { label: string; position: string }[]) ?? [];
    return (
      <div className="rounded-lg border border-emerald-950/12 p-3">
        <p className="text-sm font-semibold text-emerald-950">
          {String(data.teamName)}
        </p>
        <ul className="mt-2 columns-1 gap-x-4 text-sm text-emerald-950/75 sm:columns-2">
          {players.map((p) => (
            <li key={p.label} className="truncate py-0.5">
              <span className="text-emerald-950/45">{p.position}</span> {p.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return null;
}
