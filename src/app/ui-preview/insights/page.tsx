import { InsightsBoard } from "@/components/insights/insights-board";
import { buildRosterInsightsSignals } from "@/lib/insights/roster-signals";
import { getNoLeaguePlayerPool } from "@/lib/players/pool";
import type { FantasyTeam } from "@/lib/types";

/**
 * Auth-free Insights preview for QA / screenshots.
 * Builds a synthetic roster from the real NFL pool (no fabricated stats).
 */
export default async function InsightsPreviewPage() {
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

  // Prefer real players who currently show teammate-injury Opp chips
  // (e.g. Josh Downs / Tyler Warren ← Alec Pierce IND IR) so QA screenshots
  // exercise the feature without fabricating status.
  const preferNames = new Set([
    "Josh Downs",
    "Tyler Warren",
    "Ashton Dulin",
    "Woody Marks",
    "Troy Franklin",
  ]);
  const pick = (
    pos: "QB" | "RB" | "WR" | "TE",
    n: number,
  ) => {
    const all = pool.players.filter((p) => p.position === pos);
    const preferred = all.filter((p) => preferNames.has(p.name));
    const rest = all.filter((p) => !preferNames.has(p.name));
    return [...preferred, ...rest].slice(0, n);
  };

  // Balanced 15-man "roster" from real pool (usage/projections — no fabricated stats).
  const byPos = {
    QB: pick("QB", 2),
    RB: pick("RB", 4),
    WR: pick("WR", 5),
    TE: pick("TE", 2),
  };
  const roster = [
    ...byPos.QB.map((p, i) => ({
      ...p,
      isStarter: i === 0,
      slot: i === 0 ? ("QB" as const) : ("BN" as const),
    })),
    ...byPos.RB.map((p, i) => ({
      ...p,
      isStarter: i < 2,
      slot: i < 2 ? ("RB" as const) : ("BN" as const),
    })),
    ...byPos.WR.map((p, i) => ({
      ...p,
      isStarter: i < 2,
      slot:
        i < 2 ? ("WR" as const) : i === 2 ? ("FLEX" as const) : ("BN" as const),
      isStarterFlex: i === 2,
    })),
    ...byPos.TE.map((p, i) => ({
      ...p,
      isStarter: i === 0,
      slot: i === 0 ? ("TE" as const) : ("BN" as const),
    })),
  ].map((p) => ({
    ...p,
    isStarter: Boolean(
      p.isStarter || ("isStarterFlex" in p && p.isStarterFlex),
    ),
  }));

  const you: FantasyTeam = {
    id: 1,
    name: "Preview roster",
    abbrev: "PRE",
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
    freeAgents: pool.players.filter(
      (p) => !roster.some((r) => r.espnId === p.espnId),
    ),
  };

  const bundle = await buildRosterInsightsSignals(league, you);

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-[#1c1c1c] px-3 py-6 sm:px-4">
      <p className="type-eyebrow mb-4 text-[#C026FF]">
        UI preview · Insights signals (real pool roster)
      </p>
      <InsightsBoard you={you} bundle={bundle} />
    </main>
  );
}
