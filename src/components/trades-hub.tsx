"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FantasyPlayer, FantasyTeam, LeagueData, PlayerTrendView } from "@/lib/types";
import { TradeAnalyzer, type TrendsProp } from "@/components/trade-analyzer";
import { WhoToStart } from "@/components/who-to-start";

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
  initialTool = "analyzer",
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
  initialTool?: TradesTool;
}) {
  const [tool, setTool] = useState<TradesTool>(initialTool);

  const copy = useMemo(() => {
    if (tool === "who-to-start") {
      return {
        title: "Who to Start",
        body: "Same-position start call — pick two players, get START A / START B (or a lean) with plain-English reasons from projection, form, injury, and matchup.",
      };
    }
    return {
      title: "Trade Analyzer",
      body: "Build a trade in three steps: pick what you give, pick what you get, then see a short verdict — reason, value difference, and who wins the deal.",
    };
  }, [tool]);

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="type-page text-emerald-950">{copy.title}</h1>
        <p className="type-body mt-2 max-w-2xl text-emerald-950/65">
          {copy.body}
        </p>
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
        />
      ) : (
        <WhoToStart
          league={league}
          you={you}
          poolPlayers={poolPlayers}
          trends={trends}
          isDemo={isDemo}
        />
      )}
    </div>
  );
}
