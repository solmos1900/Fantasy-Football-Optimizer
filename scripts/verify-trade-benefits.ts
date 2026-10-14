/**
 * Unit guard: Trade Analyzer winner / difference sign must agree.
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
import type { FantasyPlayer } from "../src/lib/types";

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
    recentWeeks: partial.recentWeeks,
  };
}

// ── Critical regression: Side A 17.8, Side B 0 → gap −17.8 → Side A wins ──
{
  const giveValue = 17.8;
  const receiveValue = 0.0;
  const gap = receiveValue - giveValue; // -17.8
  const free = whoBenefitsCopy(gap, "free", giveValue, receiveValue);
  assert.equal(free.winner, "a");
  assert.match(free.headline, /Side A wins/i);
  assert.match(free.detail, /17\.8/);
  assert.ok(!/Side B wins/i.test(free.headline));

  const team = whoBenefitsCopy(gap, "team", giveValue, receiveValue);
  assert.equal(team.winner, "a");
  assert.match(team.headline, /They win/i);
}

// Side B higher → gap positive → Side B / You win
{
  const giveValue = 8;
  const receiveValue = 14.5;
  const gap = receiveValue - giveValue; // +6.5
  const free = whoBenefitsCopy(gap, "free", giveValue, receiveValue);
  assert.equal(free.winner, "b");
  assert.match(free.headline, /Side B wins/i);
  assert.match(free.detail, /6\.5/);

  const team = whoBenefitsCopy(gap, "team", giveValue, receiveValue);
  assert.equal(team.winner, "b");
  assert.match(team.headline, /You win/i);
}

// Even
{
  const even = whoBenefitsCopy(0.2, "free", 10, 10.1);
  assert.equal(even.winner, "even");
  assert.match(even.headline, /even/i);
}

// Sign must match displayed gap: winner "a" iff gap < 0 (beyond even band)
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
  } else {
    assert.equal(copy.winner, "a", `gap=${gap}`);
  }
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

console.log("verify-trade-benefits: ok");
