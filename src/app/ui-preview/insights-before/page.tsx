import { StartSitBoard } from "@/components/start-sit-board";
import { PositionChip } from "@/components/position-chip";
import { getNoLeaguePlayerPool } from "@/lib/players/pool";
import {
  computeTrendsFromLeague,
  enrichPlayersWithSnapshots,
} from "@/lib/insights/trends";
import {
  buildInsightsBundle,
  leaguePositionalAverages,
} from "@/lib/insights/engine";
import type { FantasyTeam } from "@/lib/types";

/**
 * Snapshot of the pre-redesign Insights layout (wordy cards + dual-bar Start/Sit)
 * for before/after screenshots. Uses real pool data — no fabricated stats.
 */
export default async function InsightsBeforePreviewPage() {
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
  const roster = pool.players.slice(0, 12).map((p, i) => ({
    ...p,
    isStarter: i < 8,
    slot: p.position,
  }));
  const you: FantasyTeam = {
    id: 1,
    name: "Before preview",
    abbrev: "OLD",
    ownerName: "Preview",
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    standing: 1,
    roster,
    isCurrentUser: true,
  };
  const league = {
    ...pool.contextLeague,
    teams: [you],
    freeAgents: pool.players.slice(12, 40),
  };
  const trendMap = computeTrendsFromLeague(league);
  const enriched = enrichPlayersWithSnapshots(league, trendMap);
  const youEnriched = enriched.teams[0]!;
  const trendsRecord: Record<string, (typeof trendMap extends Map<number, infer V> ? V : never)> = {};
  for (const [id, view] of trendMap) trendsRecord[String(id)] = view;
  const averages = leaguePositionalAverages(enriched);
  const bundle = buildInsightsBundle(enriched, [], trendMap);

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-3 py-6 sm:px-4">
      <p className="type-eyebrow text-orange-700">
        UI preview · BEFORE redesign (wordy Insights)
      </p>
      <div>
        <h1 className="type-page text-emerald-950">Insights</h1>
        <p className="type-body mt-2 max-w-2xl text-emerald-950/65">
          Compare two players side-by-side, then scan trade ideas, waivers, and
          news. Every call includes a plain-English reason.
        </p>
      </div>
      <StartSitBoard
        league={enriched}
        you={youEnriched}
        trends={trendsRecord}
      />
      <section className="surface-card p-5">
        <h2 className="type-eyebrow mb-3 text-emerald-950/45">
          League avg starter projection
        </h2>
        <div className="flex flex-wrap gap-5">
          {Object.entries(averages).map(([pos, avg]) => (
            <div key={pos} className="space-y-1">
              <PositionChip position={pos} />
              <p className="type-stat text-2xl text-emerald-950">
                {avg.toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      </section>
      {bundle.startSit.slice(0, 2).map((insight) => (
        <article
          key={insight.id}
          className="surface-card border-l-4 border-l-orange-600 py-4 pl-4 pr-4"
        >
          <h3 className="text-lg font-semibold text-emerald-950">
            {insight.title}
          </h3>
          <p className="mt-1.5 text-sm text-emerald-950/70">{insight.summary}</p>
          {insight.reasoning[0] && (
            <div className="mt-3 rounded-lg border border-orange-600/30 px-3 py-2.5">
              <p className="type-eyebrow text-orange-700">Why we chose this</p>
              <p className="mt-1.5 text-sm">{insight.reasoning[0]}</p>
            </div>
          )}
        </article>
      ))}
    </main>
  );
}
