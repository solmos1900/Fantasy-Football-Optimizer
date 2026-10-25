/**
 * Regression: drop/add insights must pair same-position players only (#107).
 * Run: npx tsx scripts/verify-drop-add-position.ts
 */
import assert from "node:assert/strict";
import { buildInsightsBundle } from "../src/lib/insights/engine";
import type {
  FantasyPlayer,
  FantasyTeam,
  LeagueData,
  PlayerPosition,
} from "../src/lib/types";

function player(
  partial: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "id" | "espnId" | "name" | "position">,
): FantasyPlayer {
  return {
    nflTeam: partial.nflTeam ?? "FA",
    injuryStatus: partial.injuryStatus ?? "ACTIVE",
    projectedPoints: partial.projectedPoints ?? 10,
    actualPoints: partial.actualPoints ?? 0,
    percentOwned: partial.percentOwned ?? 20,
    percentStarted: partial.percentStarted ?? 5,
    isStarter: partial.isStarter ?? false,
    slot: partial.slot ?? (partial.isStarter ? partial.position : "BN"),
    ...partial,
  };
}

function team(roster: FantasyPlayer[]): FantasyTeam {
  return {
    id: 1,
    name: "My Team",
    abbrev: "ME",
    ownerName: "Me",
    wins: 3,
    losses: 2,
    ties: 0,
    pointsFor: 500,
    pointsAgainst: 480,
    standing: 4,
    roster,
    isCurrentUser: true,
  };
}

function league(
  roster: FantasyPlayer[],
  freeAgents: FantasyPlayer[],
): LeagueData {
  return {
    leagueId: "test-drop-add",
    season: 2026,
    name: "Test",
    currentWeek: 6,
    scoringPeriodId: 6,
    isDemo: true,
    teams: [team(roster)],
    matchups: [],
    freeAgents,
    lastSyncedAt: new Date().toISOString(),
    userTeamId: 1,
  };
}

function dropAdds(data: LeagueData) {
  return buildInsightsBundle(data).other.filter((i) => i.type === "drop_add");
}

function starter(pos: PlayerPosition, name: string, espnId: number): FantasyPlayer {
  return player({
    id: `start-${pos}-${espnId}`,
    espnId,
    name,
    position: pos,
    projectedPoints: 14,
    percentOwned: 90,
    isStarter: true,
    slot: pos,
  });
}

// Minimal viable starters so weak_position / streaming noise stays out of the way.
const baseStarters = [
  starter("QB", "Starter QB", 1001),
  starter("RB", "Starter RB1", 1002),
  starter("RB", "Starter RB2", 1003),
  starter("WR", "Starter WR1", 1004),
  starter("WR", "Starter WR2", 1005),
  starter("TE", "Starter TE", 1006),
];

// ── Cross-position: low bench RB + healthy FA QB must NOT pair ──
{
  const benchRb = player({
    id: "bench-rb",
    espnId: 2001,
    name: "Bench Scrub RB",
    position: "RB",
    projectedPoints: 2,
    percentOwned: 10,
    isStarter: false,
    slot: "BN",
  });
  const faQb = player({
    id: "fa-qb",
    espnId: 3001,
    name: "Hot FA QB",
    position: "QB",
    projectedPoints: 18,
    percentOwned: 45,
  });

  const insights = dropAdds(league([...baseStarters, benchRb], [faQb]));
  assert.equal(
    insights.length,
    0,
    "RB drop + QB FA must not produce a drop_add insight",
  );
  assert.ok(
    !insights.some((i) => i.title.includes("Bench Scrub RB") && i.title.includes("Hot FA QB")),
    "must not recommend Drop RB → add QB",
  );
}

// ── Same-position upgrade still produces an insight ──
{
  const benchRb = player({
    id: "bench-rb-low",
    espnId: 2002,
    name: "Droppable RB",
    position: "RB",
    projectedPoints: 2,
    percentOwned: 12,
    isStarter: false,
    slot: "BN",
  });
  const faRb = player({
    id: "fa-rb",
    espnId: 3002,
    name: "Upgrade RB",
    position: "RB",
    projectedPoints: 11,
    percentOwned: 40,
  });
  const faQb = player({
    id: "fa-qb-distractor",
    espnId: 3003,
    name: "Better Proj QB",
    position: "QB",
    projectedPoints: 20,
    percentOwned: 50,
  });

  const insights = dropAdds(
    league([...baseStarters, benchRb], [faQb, faRb]),
  );
  assert.equal(insights.length, 1, "same-position RB upgrade should emit one drop_add");
  assert.equal(insights[0]!.relatedPlayerIds?.[0], "bench-rb-low");
  assert.equal(insights[0]!.relatedPlayerIds?.[1], "fa-rb");
  assert.match(insights[0]!.title, /Drop Droppable RB → add Upgrade RB/);
  assert.ok(
    !insights[0]!.title.includes("Better Proj QB"),
    "higher-proj QB must not win over same-position RB",
  );
}

// ── No insight when no same-position FA clears the projection delta ──
{
  const benchWr = player({
    id: "bench-wr",
    espnId: 2003,
    name: "Meh WR",
    position: "WR",
    projectedPoints: 3,
    percentOwned: 15,
    isStarter: false,
    slot: "BN",
  });
  const weakFaWr = player({
    id: "fa-wr-weak",
    espnId: 3004,
    name: "Barely Better WR",
    position: "WR",
    // Need >= 8 to enter add pool, but < drop+1 so no uplift
    projectedPoints: 3.5,
    percentOwned: 35,
  });
  const faTe = player({
    id: "fa-te",
    espnId: 3005,
    name: "Great TE",
    position: "TE",
    projectedPoints: 12,
    percentOwned: 40,
  });

  const insights = dropAdds(
    league([...baseStarters, benchWr], [weakFaWr, faTe]),
  );
  assert.equal(
    insights.length,
    0,
    "no drop_add when no same-position FA clears the +1 uplift bar",
  );
}

// ── Same FA must not be paired against two drops ──
{
  const benchRbA = player({
    id: "bench-rb-a",
    espnId: 2004,
    name: "Bench RB A",
    position: "RB",
    projectedPoints: 1,
    percentOwned: 8,
    isStarter: false,
    slot: "BN",
  });
  const benchRbB = player({
    id: "bench-rb-b",
    espnId: 2005,
    name: "Bench RB B",
    position: "RB",
    projectedPoints: 2,
    percentOwned: 9,
    isStarter: false,
    slot: "BN",
  });
  const onlyFaRb = player({
    id: "fa-rb-only",
    espnId: 3006,
    name: "Only FA RB",
    position: "RB",
    projectedPoints: 10,
    percentOwned: 35,
  });

  const insights = dropAdds(
    league([...baseStarters, benchRbA, benchRbB], [onlyFaRb]),
  );
  assert.equal(insights.length, 1, "one FA RB can only back one drop_add");
  assert.equal(insights[0]!.relatedPlayerIds?.[1], "fa-rb-only");
  const dropIds = insights.map((i) => i.relatedPlayerIds?.[0]);
  assert.equal(new Set(dropIds).size, dropIds.length);
}

console.log("verify-drop-add-position: ok");
