import { TradesHub } from "@/components/trades-hub";
import { getNoLeaguePlayerPool } from "@/lib/players/pool";
import { buildTradeTeammateInjuryIndex } from "@/lib/insights/build-trade-injury-index";
import { loadToolDisplayMeta } from "@/lib/insights/tool-display";
import type { FantasyTeam } from "@/lib/types";
import type { TradesTool } from "@/components/trades-hub";

/**
 * Auth-free preview for screenshot / QA of no-league Trade Analyzer
 * and Who to Start (Insights-parity labels, PPR strips, DVP, freshness).
 *
 * ?tool=who-to-start | analyzer
 */
export default async function NoLeagueTradesPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  const allowed =
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ALLOW_UI_PREVIEW === "1";

  if (!allowed) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-emerald-950/60">Preview disabled.</p>
      </main>
    );
  }

  const params = await searchParams;
  const initialTool: TradesTool =
    params.tool === "who-to-start" || params.tool === "start"
      ? "who-to-start"
      : "analyzer";

  const pool = await getNoLeaguePlayerPool();
  const phantomYou: FantasyTeam = {
    id: 0,
    name: "Side A",
    abbrev: "A",
    ownerName: "Preview",
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    standing: 0,
    roster: [],
    isCurrentUser: true,
  };

  const [teammateInjury, toolMeta] = await Promise.all([
    buildTradeTeammateInjuryIndex(pool.players, pool.freshness.season),
    loadToolDisplayMeta({
      season: pool.freshness.season,
      players: pool.players,
    }),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <p className="type-eyebrow mb-4 text-orange-700">
        UI preview · no-league pool
      </p>
      <TradesHub
        league={pool.contextLeague}
        you={phantomYou}
        partners={[]}
        poolPlayers={pool.players}
        trends={pool.trends}
        isDemo={false}
        noLeague
        freshness={pool.freshness}
        initialTool={initialTool}
        teammateInjury={teammateInjury}
        toolMeta={toolMeta}
      />
    </main>
  );
}
