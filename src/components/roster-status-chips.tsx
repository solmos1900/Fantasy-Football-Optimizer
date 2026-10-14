import { cn } from "@/lib/utils";
import type { FantasyPlayer } from "@/lib/types";

/** Practice squad / single-source / Reserve-Left-Squad chips for pool pickers. */
export function RosterStatusChips({
  player,
  className,
}: {
  player: Pick<
    FantasyPlayer,
    "practiceSquad" | "singleSourceTeam" | "reserveLeftSquad"
  >;
  className?: string;
}) {
  if (
    !player.practiceSquad &&
    !player.singleSourceTeam &&
    !player.reserveLeftSquad
  ) {
    return null;
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {player.reserveLeftSquad ? (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide bg-stone-200 text-stone-800">
          Reserve/Left Squad · not playing
        </span>
      ) : null}
      {!player.reserveLeftSquad && player.practiceSquad ? (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide bg-emerald-950/10 text-emerald-950/70">
          Practice squad
        </span>
      ) : null}
      {!player.reserveLeftSquad && player.singleSourceTeam ? (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide bg-orange-100 text-orange-800">
          Team not yet confirmed by a second source
        </span>
      ) : null}
    </span>
  );
}
