import Link from "next/link";
import { cn, statusColor } from "@/lib/utils";
import type { FantasyPlayer } from "@/lib/types";

export function PlayerRow({
  player,
  showOwnership = false,
}: {
  player: FantasyPlayer;
  showOwnership?: boolean;
}) {
  return (
    <Link
      href={`/players/${encodeURIComponent(player.id)}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-emerald-950/5 py-2.5 last:border-0 transition hover:bg-orange-50/50 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
    >
      <div className="hidden text-xs font-semibold uppercase tracking-wider text-emerald-950/45 sm:block">
        {player.slot ?? player.position}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-emerald-950">
            {player.name}
          </span>
          <span className="text-xs text-emerald-950/50">
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
        <div className="mt-0.5 text-xs text-emerald-950/45">
          {player.opponent ?? "—"}
          {showOwnership && (
            <span className="ml-2">
              {player.percentOwned.toFixed(0)}% owned ·{" "}
              {player.percentStarted.toFixed(0)}% started
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="type-stat text-lg text-emerald-950">
          {player.actualPoints > 0 ? player.actualPoints.toFixed(1) : "—"}
        </div>
        <div className="text-[11px] text-emerald-950/45">
          proj {player.projectedPoints.toFixed(1)}
        </div>
      </div>
    </Link>
  );
}
