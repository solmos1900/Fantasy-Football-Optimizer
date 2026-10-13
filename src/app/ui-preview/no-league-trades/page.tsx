import { TradesHub } from "@/components/trades-hub";
import { getNoLeaguePlayerPool } from "@/lib/players/pool";
import type { FantasyTeam } from "@/lib/types";

/**
 * Auth-free preview for screenshot / QA of no-league Trade Analyzer
 * freshness (Stats through Week N · updated X min ago).
 */
export default async function NoLeagueTradesPreviewPage() {
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

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <p className="type-eyebrow mb-4 text-orange-700">UI preview · no-league pool</p>
      <TradesHub
        league={pool.contextLeague}
        you={phantomYou}
        partners={[]}
        poolPlayers={pool.players}
        trends={pool.trends}
        isDemo={false}
        noLeague
        freshness={pool.freshness}
        initialTool="analyzer"
      />
    </main>
  );
}
