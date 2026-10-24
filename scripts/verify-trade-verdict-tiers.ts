/**
 * Regression (#130 + chat #146): Verdict tiers use % of the **lower** side,
 * not a raw absolute gap. Labels are Left/Right (not Side A/B).
 * - Even: < 5%
 * - Slight edge: 5% through 15%
 * - Lopsided: > 15%
 *
 * Run: npm run verify:trade-verdict-tiers
 */

import assert from "node:assert/strict";
import {
  tradeRelativeGapPct,
  tradeVerdictTierFromPct,
  verdictTierFromGap,
  whoBenefitsCopy,
} from "../src/lib/insights/trade-benefits";

// UAT repro: 18.6 vs 19.9 → gap 1.3 / 18.6 ≈ 7% (lower side) → Slight edge
{
  const a = 18.6;
  const b = 19.9;
  const gap = b - a;
  const copy = whoBenefitsCopy(gap, "free", a, b);
  assert.equal(
    verdictTierFromGap(Math.abs(gap), Math.min(a, b)),
    "slight_edge",
  );
  assert.equal(tradeVerdictTierFromPct(tradeRelativeGapPct(a, b)), "slight_edge");
  assert.equal(copy.winner, "b");
  assert.equal(copy.tier, "slight_edge");
  assert.match(copy.headline, /^Slight edge:/);
  assert.match(copy.headline, /Right gets 1\.3 more points of value/);
  assert.ok(!/Lopsided/i.test(copy.headline));
  assert.ok(!/Side A|Side B/i.test(copy.headline));
}

// > 15% of lower side → Lopsided (20 vs 16 → 4/16 = 25%)
{
  const a = 20;
  const b = 16;
  const copy = whoBenefitsCopy(b - a, "free", a, b);
  assert.equal(verdictTierFromGap(4, 16), "lopsided");
  assert.equal(copy.winner, "a");
  assert.equal(copy.tier, "lopsided");
  assert.match(copy.headline, /^Lopsided:/);
  assert.match(copy.headline, /Left gets/);
  assert.match(copy.headline, /shouldn't accept/i);
}

// Exactly 15% of lower side → Slight edge (Lopsided only when more than 15%)
{
  // abs/min = 0.15 → min=20, abs=3 → other = 23
  assert.equal(verdictTierFromGap(3, 20), "slight_edge");
  const copy = whoBenefitsCopy(3, "free", 20, 23);
  assert.equal(copy.tier, "slight_edge");
  assert.match(copy.headline, /^Slight edge:/);
}

// 5–15% band → Slight edge (just above 5% of lower)
{
  // 10 vs 10.6 → 0.6 / 10 = 6%
  const copy = whoBenefitsCopy(0.6, "free", 10, 10.6);
  assert.equal(verdictTierFromGap(0.6, 10), "slight_edge");
  assert.match(copy.headline, /^Slight edge:/);
  assert.equal(copy.differenceLabel, "+0.6 for Right");
}

// ≤ 5% → Even (old EVEN_EPS=0.5 would have called small absolute gaps lopsided)
{
  const a = 20;
  const b = 20.8; // 0.8 / 20 = 4%
  const copy = whoBenefitsCopy(b - a, "free", a, b);
  assert.equal(verdictTierFromGap(0.8, 20), "even");
  assert.equal(copy.winner, "even");
  assert.match(copy.headline, /even/i);
  assert.equal(copy.differenceLabel, "Even");
}

// Exactly 5% of lower → Slight edge (even is strictly < 5%)
{
  assert.equal(verdictTierFromGap(1, 20), "slight_edge");
  assert.equal(tradeVerdictTierFromPct(0.05), "slight_edge");
  assert.equal(tradeVerdictTierFromPct(0.049), "even");
}

// Team-mode wording
{
  const slight = whoBenefitsCopy(1.3, "team", 18.6, 19.9);
  assert.match(slight.headline, /^Slight edge: You get 1\.3 more/);
  const lop = whoBenefitsCopy(-5, "team", 20, 15);
  assert.match(lop.headline, /^Lopsided: You give 5\.0 more/);
  assert.match(lop.headline, /you shouldn't accept/);
}

console.log("verify-trade-verdict-tiers: ok");
