/**
 * Unit guard: Trade Analyzer winner / difference / plain verdict must agree.
 * Run: npm run verify:trade-benefits
 */

import assert from "node:assert/strict";
import {
  bothSidesHaveValue,
  whoBenefitsCopy,
} from "../src/lib/insights/trade-benefits";
import {
  isTradeSelectablePlayer,
  tradeIneligibleReason,
} from "../src/lib/insights/trade-eligibility";
import { compareWhoToStart } from "../src/lib/insights/who-to-start";
import { formatPlayerLabel } from "../src/lib/insights/player-label";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";

function player(
  partial: Partial<FantasyPlayer> & Pick<FantasyPlayer, "name" | "nflTeam">,
): FantasyPlayer {
  return {
    id: partial.id ?? `id-${partial.name}`,
    espnId: partial.espnId ?? 1,
    name: partial.name,
    position: partial.position ?? "RB",
    nflTeam: partial.nflTeam,
    injuryStatus: partial.injuryStatus ?? "ACTIVE",
    projectedPoints: partial.projectedPoints ?? 10,
    actualPoints: 0,
    percentOwned: 50,
    percentStarted: 40,
    opponent: partial.opponent,
    recentWeeks: partial.recentWeeks,
  };
}

// ── Critical: Side A 17.8, Side B 0 → Side A ahead; difference never negative ──
{
  const giveValue = 17.8;
  const receiveValue = 0.0;
  const gap = receiveValue - giveValue; // -17.8
  const free = whoBenefitsCopy(gap, "free", giveValue, receiveValue);
  assert.equal(free.winner, "a");
  assert.match(free.headline, /Lopsided: Side A gets 17\.8 more/i);
  assert.match(free.headline, /Side B shouldn't accept/i);
  assert.ok(!/Side B gets/i.test(free.headline));
  assert.ok(!/HARD REJECT|wins this deal/i.test(free.headline));
  assert.equal(free.differenceLabel, "+17.8 for Side A");
  assert.ok(!free.differenceLabel.includes("-"));

  const team = whoBenefitsCopy(gap, "team", giveValue, receiveValue);
  assert.equal(team.winner, "a");
  assert.match(team.headline, /You give 17\.8 more/i);
  assert.match(team.headline, /you shouldn't accept/i);
  assert.equal(team.differenceLabel, "+17.8 for Them");
}

// Side B higher → gap positive → Side B / You ahead; positive difference label
{
  const giveValue = 8;
  const receiveValue = 14.5;
  const gap = receiveValue - giveValue; // +6.5
  const free = whoBenefitsCopy(gap, "free", giveValue, receiveValue);
  assert.equal(free.winner, "b");
  assert.match(free.headline, /Lopsided: Side B gets 6\.5 more/i);
  assert.match(free.headline, /Side A shouldn't accept/i);
  assert.equal(free.differenceLabel, "+6.5 for Side B");

  const team = whoBenefitsCopy(gap, "team", giveValue, receiveValue);
  assert.equal(team.winner, "b");
  assert.match(team.headline, /You get 6\.5 more/i);
  assert.match(team.headline, /they shouldn't accept/i);
  assert.equal(team.differenceLabel, "+6.5 for You");
}

// Bijan 17.8 vs Downs 6.3 → +11.5 for Side A
{
  const copy = whoBenefitsCopy(-11.5, "free", 17.8, 6.3);
  assert.equal(copy.winner, "a");
  assert.equal(copy.differenceLabel, "+11.5 for Side A");
  assert.match(
    copy.headline,
    /Lopsided: Side A gets 11\.5 more points of value; Side B shouldn't accept\./,
  );
}

// Even
{
  const even = whoBenefitsCopy(0.2, "free", 10, 10.1);
  assert.equal(even.winner, "even");
  assert.match(even.headline, /even/i);
  assert.equal(even.differenceLabel, "Even");
}

// Sign must match: winner "a" iff gap < 0 (beyond even band); label never bare-negative
for (const [a, b] of [
  [17.8, 0],
  [12, 9],
  [5, 20],
  [10, 10],
] as const) {
  const gap = b - a;
  const copy = whoBenefitsCopy(gap, "free", a, b);
  if (Math.abs(gap) < 0.5) {
    assert.equal(copy.winner, "even");
  } else if (gap > 0) {
    assert.equal(copy.winner, "b", `gap=${gap}`);
    assert.match(copy.differenceLabel, /^\+/);
    assert.match(copy.differenceLabel, /Side B/);
  } else {
    assert.equal(copy.winner, "a", `gap=${gap}`);
    assert.match(copy.differenceLabel, /^\+/);
    assert.match(copy.differenceLabel, /Side A/);
  }
  assert.ok(!/^-/.test(copy.differenceLabel), copy.differenceLabel);
}

assert.equal(bothSidesHaveValue(17.8, 0), false);
assert.equal(bothSidesHaveValue(17.8, 12.1), true);
assert.equal(bothSidesHaveValue(0, 0), false);

const ok = player({
  name: "Bijan Robinson",
  nflTeam: "ATL",
  recentWeeks: [{ week: 1, points: 31.3 }],
});
assert.equal(isTradeSelectablePlayer(ok), true);
assert.equal(tradeIneligibleReason(ok), null);

const fa = player({
  name: "Jermar Jefferson",
  nflTeam: "FA",
  recentWeeks: [{ week: 1, points: 5 }],
});
assert.equal(isTradeSelectablePlayer(fa), false);
assert.match(tradeIneligibleReason(fa) ?? "", /team/i);

const noStats = player({
  name: "Mystery Back",
  nflTeam: "DET",
  recentWeeks: [],
});
assert.equal(isTradeSelectablePlayer(noStats), false);
assert.match(tradeIneligibleReason(noStats) ?? "", /2026 stats/i);

// ── Who to Start: bye / OUT must not say "projects X more points" ──
{
  const league: LeagueData = {
    leagueId: "test",
    season: 2026,
    name: "Test",
    currentWeek: 6,
    scoringPeriodId: 6,
    isDemo: true,
    teams: [],
    matchups: [],
    freeAgents: [],
    lastSyncedAt: new Date().toISOString(),
    userTeamId: 1,
  };

  const bijan = player({
    id: "bijan",
    name: "Bijan Robinson",
    nflTeam: "ATL",
    opponent: "CHI",
    projectedPoints: 25.6,
    recentWeeks: [{ week: 1, points: 31.3 }],
  });
  const gibbsBye = player({
    id: "gibbs",
    name: "Jahmyr Gibbs",
    nflTeam: "DET",
    opponent: "BYE",
    projectedPoints: 0,
    recentWeeks: [{ week: 1, points: 33.6 }],
  });
  const outRb = player({
    id: "out-rb",
    name: "Injured Back",
    nflTeam: "KC",
    opponent: "DEN",
    injuryStatus: "OUT",
    projectedPoints: 0,
    recentWeeks: [{ week: 1, points: 10 }],
  });

  const byeCmp = compareWhoToStart(league, bijan, gibbsBye);
  assert.equal(byeCmp.ok, true);
  if (byeCmp.ok) {
    const labelA = formatPlayerLabel(bijan.name, bijan.nflTeam);
    const labelB = formatPlayerLabel(gibbsBye.name, gibbsBye.nflTeam);
    assert.equal(byeCmp.verdict, "start_a");
    assert.equal(
      byeCmp.headline,
      `Start ${labelA}: ${labelB} is on bye this week.`,
    );
    assert.ok(!/projects .+ more points/i.test(byeCmp.headline));
    assert.ok(!/projects .+ more points/i.test(byeCmp.summary));
  }

  const outCmp = compareWhoToStart(league, bijan, outRb);
  assert.equal(outCmp.ok, true);
  if (outCmp.ok) {
    const labelA = formatPlayerLabel(bijan.name, bijan.nflTeam);
    const labelB = formatPlayerLabel(outRb.name, outRb.nflTeam);
    assert.equal(outCmp.verdict, "start_a");
    assert.equal(
      outCmp.headline,
      `Start ${labelA}: ${labelB} is OUT this week.`,
    );
    assert.ok(!/projects .+ more points/i.test(outCmp.headline));
  }
}

console.log("verify-trade-benefits: ok");
