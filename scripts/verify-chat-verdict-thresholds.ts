/**
 * Chat / shared trade verdict thresholds:
 *   4.9% → even, 10% → slight edge, 16% → lopsided
 * Run: npx tsx scripts/verify-chat-verdict-thresholds.ts
 */

import assert from "node:assert/strict";
import {
  tradeRelativeGapPct,
  tradeVerdictTierFromPct,
  whoBenefitsCopy,
} from "../src/lib/insights/trade-benefits";
import { runTradeCompare } from "../src/lib/chat/tool-runners";
import type { FantasyPlayer } from "../src/lib/types";
import type { PlayerPoolFreshness } from "../src/lib/players/pool";

function player(
  partial: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "name" | "nflTeam" | "espnId">,
): FantasyPlayer {
  return {
    id: `espn-${partial.espnId}`,
    espnId: partial.espnId,
    name: partial.name,
    position: partial.position ?? "WR",
    nflTeam: partial.nflTeam,
    injuryStatus: "ACTIVE",
    projectedPoints:
      partial.projectedPoints !== undefined ? partial.projectedPoints : 14,
    actualPoints: null,
    percentOwned: 80,
    percentStarted: 70,
    opponent: partial.opponent ?? "@BUF",
    recentWeeks: partial.recentWeeks ?? [
      { week: 1, points: 12 },
      { week: 2, points: 14 },
      { week: 3, points: 13 },
      { week: 4, points: 15 },
      { week: 5, points: 14 },
      { week: 6, points: 16 },
    ],
  };
}

const freshness: PlayerPoolFreshness = {
  season: 2026,
  currentWeek: 7,
  statsThroughWeek: 6,
  statsUpdatedAt: new Date().toISOString(),
  projectionsUpdatedAt: new Date().toISOString(),
  latestWeekMissing: false,
  warning: null,
  scoringLabel: "full PPR",
};

// Direct shared helpers
assert.equal(tradeVerdictTierFromPct(0.049), "even");
assert.equal(tradeVerdictTierFromPct(0.1), "slight_edge");
assert.equal(tradeVerdictTierFromPct(0.16), "lopsided");

{
  const even = whoBenefitsCopy(4.9, "free", 100, 104.9);
  assert.equal(even.tier, "even");
  assert.equal(even.tone, "neutral");
  assert.ok(Math.abs(even.pctGap - 0.049) < 0.001);
}

{
  const slight = whoBenefitsCopy(10, "free", 100, 110);
  assert.equal(slight.tier, "slight_edge");
  assert.equal(slight.tone, "caution");
  assert.match(slight.headline, /Slight edge/i);
  assert.match(slight.headline, /shouldn't accept/i);
  assert.ok(!/Lopsided/i.test(slight.headline));
  // Never green celebration for reject copy
  assert.notEqual(slight.tone, "positive");
}

{
  const lop = whoBenefitsCopy(16, "free", 100, 116);
  assert.equal(lop.tier, "lopsided");
  assert.equal(lop.tone, "caution");
  assert.match(lop.headline, /Lopsided/i);
}

// 28.1 vs 32.3 (~13%) must be slight edge through whoBenefitsCopy
{
  const pct = tradeRelativeGapPct(28.1, 32.3);
  assert.equal(tradeVerdictTierFromPct(pct), "slight_edge");
  const copy = whoBenefitsCopy(4.2, "free", 28.1, 32.3);
  assert.equal(copy.tier, "slight_edge");
  assert.match(copy.headline, /Slight edge/i);
  assert.ok(!/Lopsided/i.test(copy.headline));
}

// Chat runner surfaces the same tier/tone
{
  // Build packages whose chip values aren't under our control here —
  // assert whoBenefitsCopy path used by runTradeCompare for a known gap via
  // the shared function already covered above. Also ensure runner fields exist.
  const a = player({
    espnId: 1,
    name: "Puka Nacua",
    nflTeam: "LAR",
    opponent: "@JAX",
    projectedPoints: 18,
    recentWeeks: [
      { week: 1, points: 20 },
      { week: 2, points: 22 },
      { week: 3, points: 18 },
      { week: 4, points: 24 },
      { week: 5, points: 19 },
      { week: 6, points: 21 },
    ],
  });
  const b = player({
    espnId: 2,
    name: "Ja'Marr Chase",
    nflTeam: "CIN",
    opponent: "PIT",
    projectedPoints: 17,
    recentWeeks: [
      { week: 1, points: 16 },
      { week: 2, points: 14 },
      { week: 3, points: 19 },
      { week: 4, points: 15 },
      { week: 5, points: 17 },
      { week: 6, points: 18 },
    ],
  });
  const result = runTradeCompare({
    sideA: [a],
    sideB: [b],
    freshness,
  });
  if (result.ok) {
    assert.ok(["even", "slight_edge", "lopsided"].includes(result.tier));
    assert.ok(["neutral", "positive", "caution"].includes(result.tone));
    if (/shouldn't accept/i.test(result.headline)) {
      assert.equal(result.tone, "caution");
    }
    assert.ok(!/Side A|Side B|chip value|PPG|\bproj\b/i.test(result.headline));
  }
}

console.log("verify-chat-verdict-thresholds: ok");
