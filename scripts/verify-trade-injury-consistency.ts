/**
 * Regression (#108): Trade Analyzer displayed totals, fairness, hard-reject,
 * and acceptance lean must all use the same injury-adjusted chip values.
 *
 * Run: npm run verify:trade-injury-consistency
 */

import assert from "node:assert/strict";
import {
  analyzeTrade,
  comparePlayerPackages,
} from "../src/lib/insights/trade-analyzer";
import {
  fairnessFromSideValues,
  fairnessScore,
  hardRejectReasons,
  sideValue,
  sideValueRatio,
  OUTRAGEOUS_VALUE_RATIO,
} from "../src/lib/insights/trade-value";
import type { TeammateInjuryIndex } from "../src/lib/insights/teammate-injury";
import type { FantasyPlayer, FantasyTeam } from "../src/lib/types";

function player(
  partial: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "name" | "nflTeam" | "espnId">,
): FantasyPlayer {
  return {
    id: partial.id ?? `id-${partial.espnId}`,
    espnId: partial.espnId,
    name: partial.name,
    position: partial.position ?? "WR",
    nflTeam: partial.nflTeam,
    injuryStatus: partial.injuryStatus ?? "ACTIVE",
    projectedPoints: partial.projectedPoints ?? 10,
    actualPoints: 0,
    percentOwned: 50,
    percentStarted: 40,
    opponent: partial.opponent,
    recentWeeks:
      partial.recentWeeks ??
      [
        { week: 1, points: partial.projectedPoints ?? 10 },
        { week: 2, points: partial.projectedPoints ?? 10 },
        { week: 3, points: partial.projectedPoints ?? 10 },
      ],
  };
}

function team(
  id: number,
  name: string,
  roster: FantasyPlayer[],
): FantasyTeam {
  return {
    id,
    name,
    abbrev: name.slice(0, 3).toUpperCase(),
    ownerName: `${name} Owner`,
    wins: 4,
    losses: 3,
    ties: 0,
    pointsFor: 700,
    pointsAgainst: 680,
    standing: id,
    roster,
  };
}

function injuryIndex(
  deltas: Array<[number, number]>,
): TeammateInjuryIndex {
  return {
    byEspnId: new Map(),
    chipDeltaByEspnId: new Map(deltas),
    updatedAt: new Date().toISOString(),
    statsThroughWeek: 5,
  };
}

// ── Scenario: teammate-injury delta flips relative value ──────────────────
// Same-tier (tier gap < 2) so only the chip ratio drives hard-reject.
// Without deltas: give (high WR) >> receive (mid WR) → outrageous by ratio.
// With +7 chip on receive: values flip close → not outrageous.
{
  const givePlayer = player({
    espnId: 1001,
    name: "Alpha Receiver",
    nflTeam: "KC",
    position: "WR",
    projectedPoints: 15,
  });
  const receivePlayer = player({
    espnId: 2002,
    name: "Beta Receiver",
    nflTeam: "BUF",
    position: "WR",
    projectedPoints: 9.5,
  });

  const give = [givePlayer];
  const receive = [receivePlayer];
  const deltaMap = new Map<number, number>([[2002, 7]]);
  const teammateInjury = injuryIndex([[2002, 7]]);

  const bareGive = sideValue(give);
  const bareReceive = sideValue(receive);
  const adjGive = sideValue(give, undefined, deltaMap);
  const adjReceive = sideValue(receive, undefined, deltaMap);

  assert.ok(
    bareGive > bareReceive,
    "baseline: give side is ahead before injury deltas",
  );
  assert.ok(
    sideValueRatio(bareGive, bareReceive) > OUTRAGEOUS_VALUE_RATIO,
    "baseline: bare values are outrageous (hard-reject candidate)",
  );
  assert.ok(
    adjReceive > adjGive,
    "with injury delta on receive, relative value flips",
  );
  assert.ok(
    sideValueRatio(adjGive, adjReceive) <= OUTRAGEOUS_VALUE_RATIO,
    "with injury delta, ratio is within fairness band",
  );

  // Old bug path: fairness/hard-reject without deltaMap disagree with adjusted totals
  const staleFair = fairnessScore(give, receive);
  const staleRejects = hardRejectReasons(give, receive);
  assert.ok(
    staleRejects.length > 0,
    "stale path (no deltaMap) still hard-rejects — documents the bug",
  );
  assert.ok(
    staleFair < fairnessFromSideValues(adjGive, adjReceive),
    "stale fairness is worse than injury-adjusted fairness",
  );

  const you = team(1, "Yours", [
    givePlayer,
    player({
      espnId: 1100,
      name: "Your Bench WR",
      nflTeam: "DAL",
      projectedPoints: 8,
    }),
    player({
      espnId: 1101,
      name: "Your RB1",
      nflTeam: "SF",
      position: "RB",
      projectedPoints: 14,
    }),
    player({
      espnId: 1102,
      name: "Your RB2",
      nflTeam: "DET",
      position: "RB",
      projectedPoints: 11,
    }),
  ]);
  // Them thin at WR so your give fills their need (acceptance lean path).
  const them = team(2, "Theirs", [
    receivePlayer,
    player({
      espnId: 2200,
      name: "Their Only Other WR",
      nflTeam: "MIA",
      projectedPoints: 6,
    }),
    player({
      espnId: 2201,
      name: "Their RB1",
      nflTeam: "BAL",
      position: "RB",
      projectedPoints: 13,
    }),
    player({
      espnId: 2202,
      name: "Their RB2",
      nflTeam: "PHI",
      position: "RB",
      projectedPoints: 10,
    }),
  ]);

  const analysis = analyzeTrade(
    you,
    them,
    give,
    receive,
    undefined,
    teammateInjury,
  );
  assert.ok(analysis, "analyzeTrade returns an analysis");

  // Displayed totals match the single injury-adjusted valuation
  assert.equal(analysis!.giveValue, adjGive);
  assert.equal(analysis!.receiveValue, adjReceive);
  assert.equal(analysis!.valueGap, adjReceive - adjGive);

  // Fairness / hard-reject agree with those totals (not the stale bare path)
  assert.equal(
    fairnessFromSideValues(analysis!.giveValue, analysis!.receiveValue),
    fairnessFromSideValues(adjGive, adjReceive),
  );
  assert.deepEqual(
    analysis!.hardRejectReasons,
    hardRejectReasons(give, receive, undefined, deltaMap, {
      give: adjGive,
      receive: adjReceive,
    }),
  );
  assert.equal(
    analysis!.hardRejectReasons.length,
    0,
    "injury-adjusted deal must not hard-reject when ratio is fair",
  );
  assert.notEqual(
    analysis!.verdict,
    "hard_reject",
    "verdict must not hard-reject when displayed totals are fair",
  );

  // Acceptance lean is not blocked (hard reject cleared) and uses adjusted value
  assert.notEqual(analysis!.acceptanceLean, "none");
  // They receive the boosted-side assets? Here they receive givePlayer (no delta)
  // and send receivePlayer (with +8). giveValue < receiveValue * 0.95 after flip,
  // so valueFavorThem is false — lean still medium/low from need-fit, never "none".
  assert.ok(
    ["low", "medium", "high"].includes(analysis!.acceptanceLean),
    `lean should be active, got ${analysis!.acceptanceLean}`,
  );

  // Free-compare path must stay consistent too
  const pkg = comparePlayerPackages(give, receive, undefined, teammateInjury);
  assert.ok(pkg);
  assert.equal(pkg!.giveValue, adjGive);
  assert.equal(pkg!.receiveValue, adjReceive);
  assert.equal(pkg!.hardRejectReasons.length, 0);
  assert.notEqual(pkg!.verdict, "hard_reject");
}

// ── Lean uses injury-adjusted give/receive (trends+delta), not bare chips ──
// You send a mid WR who gets a large teammate-injury bump; they send a similar WR.
// Without delta, valueFavorThem fails; with delta on give, it passes → lean high.
{
  const givePlayer = player({
    espnId: 3001,
    name: "Boosted Asset",
    nflTeam: "HOU",
    position: "WR",
    projectedPoints: 10,
  });
  const receivePlayer = player({
    espnId: 3002,
    name: "Even Asset",
    nflTeam: "CIN",
    position: "WR",
    projectedPoints: 11.5,
  });
  const give = [givePlayer];
  const receive = [receivePlayer];
  // They receive givePlayer; +2.5 bump makes giveValue clear the 0.95 bar.
  const deltaMap = new Map<number, number>([[3001, 2.5]]);
  const teammateInjury = injuryIndex([[3001, 2.5]]);

  const bareFavor =
    sideValue(give) >= sideValue(receive) * 0.95;
  const adjFavor =
    sideValue(give, undefined, deltaMap) >=
    sideValue(receive, undefined, deltaMap) * 0.95;
  assert.equal(bareFavor, false, "bare chips do not favor them");
  assert.equal(adjFavor, true, "injury-adjusted chips favor them");

  const you = team(1, "Yours", [
    givePlayer,
    player({
      espnId: 3100,
      name: "Spare WR",
      nflTeam: "NYJ",
      projectedPoints: 9,
    }),
    player({
      espnId: 3101,
      name: "RB A",
      nflTeam: "ATL",
      position: "RB",
      projectedPoints: 12,
    }),
    player({
      espnId: 3102,
      name: "RB B",
      nflTeam: "CHI",
      position: "RB",
      projectedPoints: 10,
    }),
  ]);
  const them = team(2, "Theirs", [
    receivePlayer,
    // Thin WR depth → needsPosition(them, WR) true after needing starter floor
    player({
      espnId: 3200,
      name: "Weak WR2",
      nflTeam: "LV",
      projectedPoints: 5,
    }),
    player({
      espnId: 3201,
      name: "RB C",
      nflTeam: "GB",
      position: "RB",
      projectedPoints: 12,
    }),
    player({
      espnId: 3202,
      name: "RB D",
      nflTeam: "SEA",
      position: "RB",
      projectedPoints: 9,
    }),
  ]);

  const analysis = analyzeTrade(
    you,
    them,
    give,
    receive,
    undefined,
    teammateInjury,
  );
  assert.ok(analysis);
  assert.equal(analysis!.giveValue, sideValue(give, undefined, deltaMap));
  assert.equal(
    analysis!.receiveValue,
    sideValue(receive, undefined, deltaMap),
  );
  assert.equal(analysis!.hardRejectReasons.length, 0);
  // fillsTheirNeed + fair >= 0.45 + valueFavorThem → high
  assert.equal(
    analysis!.acceptanceLean,
    "high",
    "acceptance lean must use injury-adjusted side values",
  );
}

console.log("verify-trade-injury-consistency: ok");
