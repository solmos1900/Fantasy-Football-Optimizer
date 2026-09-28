import Link from "next/link";
import { cn, formatStatusCode, statusColor } from "@/lib/utils";
import type { FantasyPlayer, PlayerPosition } from "@/lib/types";
import { PositionChip } from "@/components/position-chip";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function PlayerAvatar({ name }: { name: string }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold tracking-wide text-emerald-800 ring-1 ring-emerald-950/10"
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

function MetricBlock({
  primary,
  secondaryLabel,
  secondary,
  emphasize = "actual",
}: {
  primary: string;
  secondaryLabel: string;
  secondary: string;
  emphasize?: "actual" | "proj";
}) {
  return (
    <div className="shrink-0 text-right tabular-nums">
      <div
        className={cn(
          "type-stat leading-none",
          emphasize === "actual" ? "text-xl text-emerald-950 sm:text-2xl" : "text-lg text-emerald-950",
        )}
      >
        {primary}
      </div>
      <div className="mt-0.5 text-[10px] leading-tight text-emerald-950/45">
        <span className="uppercase tracking-wider">{secondaryLabel}</span>{" "}
        <span className="type-stat text-[12px] text-emerald-950/60">{secondary}</span>
      </div>
    </div>
  );
}

export function PlayerRow({
  player,
  showOwnership = false,
  /** Team roster: badge lineup slot (QB/FLEX/BN…). Else badge player.position. */
  showSlotBadge = true,
  ownerLabel,
  rank,
  weekLabel,
  /** Prefer projected as the large right metric (Players directory). */
  preferProjected = false,
}: {
  player: FantasyPlayer;
  showOwnership?: boolean;
  showSlotBadge?: boolean;
  /** Fantasy team name or "FA" when known — never invent ownership. */
  ownerLabel?: string;
  rank?: number;
  /** e.g. "WK3" when league current week is known — labels only, not invented points. */
  weekLabel?: string;
  preferProjected?: boolean;
}) {
  const slot = formatStatusCode(player.slot ?? player.position);
  const badge = showSlotBadge ? slot : formatStatusCode(player.position);
  const injury = formatStatusCode(player.injuryStatus);
  const actual =
    player.actualPoints > 0 ? player.actualPoints.toFixed(1) : "—";
  const proj = player.projectedPoints.toFixed(1);
  const matchup = player.opponent?.trim() || null;
  const posTeam = `${player.position} · ${player.nflTeam}`;
  const useProjPrimary = preferProjected;

  const stripBits: { label: string; value: string }[] = [];
  if (weekLabel) {
    stripBits.push({ label: `${weekLabel} ACT`, value: actual });
    stripBits.push({ label: `${weekLabel} PROJ`, value: proj });
  } else {
    stripBits.push({ label: "ACT", value: actual });
    stripBits.push({ label: "PROJ", value: proj });
  }
  if (showOwnership && Number.isFinite(player.percentOwned)) {
    stripBits.push({
      label: "OWN",
      value: `${player.percentOwned.toFixed(0)}%`,
    });
  }

  return (
    <Link
      href={`/players/${encodeURIComponent(player.id)}`}
      className="group flex gap-2 rounded-md px-1 py-1.5 transition hover:bg-emerald-950/[0.04] sm:gap-2.5 sm:px-1.5"
    >
      {typeof rank === "number" && (
        <span className="w-5 shrink-0 self-center text-center text-xs font-semibold tabular-nums text-emerald-950/40">
          {rank}
        </span>
      )}

      <PositionChip position={badge} />

      <PlayerAvatar name={player.name} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[15px] font-semibold leading-tight text-emerald-950">
            {player.name}
          </span>
          {injury !== "ACTIVE" && (
            <span
              className={cn(
                "shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase leading-tight",
                statusColor(injury),
              )}
            >
              {injury}
            </span>
          )}
        </div>

        <div className="mt-0.5 truncate text-[11px] leading-snug text-emerald-950/50">
          {posTeam}
          {ownerLabel ? (
            <span className="text-emerald-950/35"> · {ownerLabel}</span>
          ) : null}
        </div>

        {matchup && (
          <div className="mt-0.5 truncate text-[11px] leading-snug text-emerald-950/40">
            {matchup}
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {stripBits.map((bit) => (
            <span key={bit.label} className="text-[10px] leading-none">
              <span className="uppercase tracking-wider text-emerald-950/35">
                {bit.label}
              </span>{" "}
              <span className="font-medium tabular-nums text-emerald-950/75">
                {bit.value}
              </span>
            </span>
          ))}
        </div>
      </div>

      <MetricBlock
        primary={useProjPrimary ? proj : actual}
        secondaryLabel={useProjPrimary ? "act" : "proj"}
        secondary={useProjPrimary ? actual : proj}
        emphasize={useProjPrimary ? "proj" : "actual"}
      />
    </Link>
  );
}

/** Empty IR / bench slot placeholder — honest empty, no fake player. */
export function EmptyRosterSlot({
  slot,
  label = "Empty",
}: {
  slot: PlayerPosition | "BN" | "IR";
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5 sm:gap-2.5 sm:px-1.5">
      <PositionChip position={slot} />
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100/80 text-[10px] text-emerald-950/30 ring-1 ring-emerald-950/10"
        aria-hidden
      >
        —
      </div>
      <span className="text-sm text-emerald-950/40">{label}</span>
    </div>
  );
}
