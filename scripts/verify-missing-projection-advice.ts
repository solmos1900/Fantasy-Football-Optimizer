/**
 * Regression (#95): advice must not treat a missing projection as 0.0.
 * Start/sit, drop/add, streaming, weak-position and Who to Start only compare
 * players whose projections are real numbers.
 * Run: npx tsx scripts/verify-missing-projection-advice.ts
 */
import assert from "node:assert/strict";
import { buildInsightsBundle } from "../src/lib/insights/engine";
import { compareWhoToStart } from "../src/lib/insights/who-to-start";
import { needsPosition } from "../src/lib/insights/trade-value";
import type {
  FantasyPlayer,
  FantasyTeam,
  LeagueData,
} from "../src/lib/types";

function player(
  partial: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "id" | "espnId" | "name" | "position">,
): FantasyPlayer {
  return {
    nflTeam: "BAL",
    injuryStatus: "ACTIVE",
    projectedPoints: 10,
    actualPoints: null,
    percentOwned: 80,
    percentStarted: 50,
    isStarter: false,
    slot: partial.isStarter ? partial.position : "BN",
    opponent: "CIN",
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
  freeAgents: FantasyPlayer[] = [],
): LeagueData {
  return {
    leagueId: "test-missing-proj",
    season: 2026,
    name: "Test",
    currentWeek: 8,
    scoringPeriodId: 8,
    isDemo: true,
    teams: [team(roster)],
    matchups: [],
    freeAgents,
    lastSyncedAt: new Date().toISOString(),
    userTeamId: 1,
  };
}

const noFakeZero = (text: string) =>
  assert.ok(!/\b0\.0\b/.test(text), `advice shows a fake 0.0: "${text}"`);

// ── Start/sit: a starter with no projection is not "projecting 0.0" ──────
{
  const daniels = player({
    id: "qb-daniels",
    espnId: 1,
    name: "Jayden Daniels",
    nflTeam: "WSH",
    position: "QB",
    projectedPoints: null,
    isStarter: true,
  });
  const lamar = player({
    id: "qb-lamar",
    espnId: 2,
    name: "Lamar Jackson",
    position: "QB",
    projectedPoints: 20.5,
  });
  const bundle = buildInsightsBundle(league([daniels, lamar]));
  assert.equal(
    bundle.startSit.filter((i) => i.verdict === "START").length,
    0,
    "no START call against a starter with a missing projection",
  );
  for (const i of [...bundle.startSit, ...bundle.other]) {
    noFakeZero(`${i.title} ${i.summary} ${i.reasoning.join(" ")}`);
  }

  // A real gap still produces the call.
  const realStarter = { ...daniels, projectedPoints: 12 };
  const real = buildInsightsBundle(league([realStarter, lamar]));
  assert.ok(
    real.startSit.some((i) => i.verdict === "START"),
    "real projections still get a START call",
  );
}

// ── Bench player with no projection never gets START ─────────────────────
{
  const starter = player({
    id: "wr-start",
    espnId: 10,
    name: "Starter WR",
    position: "WR",
    projectedPoints: 9,
    isStarter: true,
  });
  const bench = player({
    id: "wr-bench",
    espnId: 11,
    name: "Bench WR",
    position: "WR",
    projectedPoints: null,
    recentWeeks: [
      { week: 5, points: 25 },
      { week: 6, points: 25 },
      { week: 7, points: 25 },
    ],
  });
  const bundle = buildInsightsBundle(league([starter, bench]));
  assert.equal(bundle.startSit.length, 0);
}

// ── Drop check: healthy bench player with no projection isn't a drop ─────
{
  const starter = player({
    id: "rb-start",
    espnId: 20,
    name: "Starter RB",
    position: "RB",
    projectedPoints: 15,
    isStarter: true,
  });
  const benchNoProj = player({
    id: "rb-bench",
    espnId: 21,
    name: "Bench RB",
    position: "RB",
    projectedPoints: null,
    percentOwned: 60,
  });
  const fa = player({
    id: "rb-fa",
    espnId: 22,
    name: "Waiver RB",
    position: "RB",
    projectedPoints: 9,
    percentOwned: 40,
  });
  const drops = buildInsightsBundle(
    league([starter, benchNoProj], [fa]),
  ).other.filter((i) => i.type === "drop_add");
  assert.equal(drops.length, 0, "missing projection is not < 4");

  // Same player with a real low projection is still flagged.
  const realLow = { ...benchNoProj, projectedPoints: 2 };
  const realDrops = buildInsightsBundle(
    league([starter, realLow], [fa]),
  ).other.filter((i) => i.type === "drop_add");
  assert.equal(realDrops.length, 1);
}

// ── Streaming K: missing starter projection isn't 0.0 ────────────────────
{
  const k = player({
    id: "k-mine",
    espnId: 30,
    name: "My Kicker",
    position: "K",
    projectedPoints: null,
    isStarter: true,
  });
  const faK = player({
    id: "k-fa",
    espnId: 31,
    name: "FA Kicker",
    position: "K",
    projectedPoints: 8,
  });
  const streams = buildInsightsBundle(league([k], [faK])).other.filter(
    (i) => i.type === "streaming",
  );
  assert.equal(streams.length, 0);
}

// ── Who to Start: no call on a missing projection ────────────────────────
{
  const daniels = player({
    id: "qb-daniels",
    espnId: 1,
    name: "Jayden Daniels",
    nflTeam: "WSH",
    position: "QB",
    projectedPoints: null,
    isStarter: true,
  });
  const lamar = player({
    id: "qb-lamar",
    espnId: 2,
    name: "Lamar Jackson",
    position: "QB",
    projectedPoints: 20.5,
  });
  const data = league([daniels, lamar]);
  const r = compareWhoToStart(data, lamar, daniels);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.verdict, "toss_up");
    assert.equal(r.verdictLabel, "NO CALL");
    assert.equal(r.edge, 0);
    assert.equal(r.sideB.projectedPoints, null);
    assert.equal(r.sideA.projectedPoints, 20.5);
    for (const t of [r.headline, r.summary, ...r.reasons]) noFakeZero(t);
    assert.ok(r.reasons.some((t) => t.includes("no projection yet")));
  }

  // Tool meta loaded but no Sleeper row for one side → also no call.
  const withMeta = compareWhoToStart(data, lamar, daniels, {
    toolMeta: {
      sleeperByEspnId: { "2": 20.5 },
    } as never,
  });
  assert.ok(withMeta.ok && withMeta.verdictLabel === "NO CALL");

  // OUT still forces the healthy side, even without a projection.
  const out = compareWhoToStart(
    data,
    { ...lamar, injuryStatus: "OUT" },
    daniels,
  );
  assert.ok(out.ok && out.verdict === "start_b");

  // A bye week is a real 0, not "no projection yet".
  const bye = compareWhoToStart(data, lamar, {
    ...daniels,
    projectedPoints: 0,
    opponent: "BYE",
  });
  assert.ok(bye.ok && bye.verdict === "start_a");
  if (bye.ok) {
    assert.equal(bye.sideB.projectedPoints, 0);
    assert.ok(!bye.reasons.some((t) => t.includes("no projection yet")));
  }

  // Real projections still produce a call.
  const real = compareWhoToStart(data, lamar, { ...daniels, projectedPoints: 12 });
  assert.ok(real.ok && real.verdict === "start_a");
  if (real.ok) assert.ok(Math.abs(real.edge - 8.5) < 0.01);
}

// ── Trade needs: missing projection is unknown, not a weak starter ───────
{
  const qb = player({
    id: "qb-x",
    espnId: 40,
    name: "QB X",
    position: "QB",
    projectedPoints: null,
    isStarter: true,
  });
  assert.equal(needsPosition(team([qb]), "QB"), false);
  assert.equal(
    needsPosition(team([{ ...qb, projectedPoints: 8 }]), "QB"),
    true,
  );
}

console.log("verify-missing-projection-advice: OK");
