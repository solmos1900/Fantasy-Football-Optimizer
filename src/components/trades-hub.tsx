"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FantasyPlayer, FantasyTeam, LeagueData, PlayerTrendView } from "@/lib/types";
import { TradeAnalyzer, type TrendsProp } from "@/components/trade-analyzer";
import { WhoToStart } from "@/components/who-to-start";
import { PoolFreshnessBanner } from "@/components/pool-freshness-banner";
import type { PlayerPoolFreshness } from "@/lib/players/pool";
import type { serializeTeammateInjuryIndex } from "@/lib/insights/teammate-injury";
import type { ToolDisplayMeta } from "@/lib/insights/tool-display";

export type TradesTool = "analyzer" | "who-to-start";

export function TradesHub({
  league,
  you,
  partners,
  poolPlayers,
  trends,
  initialPartnerId,
  initialGiveIds,
  initialReceiveIds,
  isDemo,
  noLeague = false,
  freshness,
  initialTool = "analyzer",
  teammateInjury,
  toolMeta,
}: {
  league: LeagueData;
  you: FantasyTeam;
  partners: FantasyTeam[];
  poolPlayers: FantasyPlayer[];
  trends: TrendsProp | Record<string, PlayerTrendView>;
  initialPartnerId?: number;
  initialGiveIds?: string[];
  initialReceiveIds?: string[];
  isDemo?: boolean;
  /** True when the user has no ESPN league — free-pool tools only. */
  noLeague?: boolean;
  freshness?: PlayerPoolFreshness;
  initialTool?: TradesTool;
  teammateInjury?: ReturnType<typeof serializeTeammateInjuryIndex>;
  toolMeta?: ToolDisplayMeta | null;
}) {
  const [tool, setTool] = useState<TradesTool>(initialTool);

  const copy = useMemo(() => {
    if (tool === "who-to-start") {
      return {
        title: "Who to Start",
        // Keep hub copy minimal — WhoToStart owns the one-line intro.
        body: noLeague
          ? "Pick any two same-position NFL players."
          : "Pick two same-position players from your league pool.",
      };
    }
    return {
      title: "Trade Analyzer",
      body: noLeague
        ? "Compare any NFL players side vs side (full PPR). Connect a league to unlock team-trade packages against league mates."
        : "Build a trade in three steps: pick what you give, pick what you get, then see a short verdict — reason, value difference, and who wins the deal.",
    };
  }, [tool, noLeague]);

  return (
    <div className="space-y-8">
      <div className="animate-fade-up space-y-3">
        <h1 className="type-page text-emerald-950">{copy.title}</h1>
        <p className="type-body max-w-2xl text-emerald-950/65">{copy.body}</p>
        {freshness && <PoolFreshnessBanner freshness={freshness} />}
        {noLeague && (!poolPlayers || poolPlayers.length === 0) && (
          <p
            role="status"
            className="rounded-xl border border-orange-600/30 bg-orange-50/40 px-3 py-2 text-sm text-orange-800"
          >
            No player stats are available yet. Check back after the next data
            refresh — we never invent points.
          </p>
        )}
      </div>

      <div
        className="inline-flex rounded-xl border border-emerald-950/15 bg-[color-mix(in_srgb,var(--kraft)_25%,var(--surface))] p-1"
        role="tablist"
        aria-label="Trades tools"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tool === "analyzer"}
          onClick={() => setTool("analyzer")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            tool === "analyzer"
              ? "bg-emerald-950 text-emerald-50"
              : "text-emerald-950/65 hover:bg-emerald-950/10 hover:text-emerald-950",
          )}
        >
          Trade Analyzer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tool === "who-to-start"}
          onClick={() => setTool("who-to-start")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            tool === "who-to-start"
              ? "bg-emerald-950 text-emerald-50"
              : "text-emerald-950/65 hover:bg-emerald-950/10 hover:text-emerald-950",
          )}
        >
          Who to Start
        </button>
      </div>

      {tool === "analyzer" ? (
        <TradeAnalyzer
          you={you}
          partners={partners}
          poolPlayers={poolPlayers}
          trends={trends}
          initialPartnerId={initialPartnerId}
          initialGiveIds={initialGiveIds}
          initialReceiveIds={initialReceiveIds}
          isDemo={isDemo}
          forceFreeMode={noLeague}
          teammateInjury={teammateInjury}
          toolMeta={toolMeta}
        />
      ) : (
        <WhoToStart
          league={league}
          you={you}
          poolPlayers={poolPlayers}
          trends={trends}
          isDemo={isDemo}
          noLeague={noLeague}
          toolMeta={toolMeta}
          teammateInjury={teammateInjury}
        />
      )}
    </div>
  );
}
