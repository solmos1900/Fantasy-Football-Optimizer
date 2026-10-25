/**
 * Regression (#130): Verdict tiers use % of the larger side, not a 0.5 absolute gap.
 * - Even: ≤ 5%
 * - Slight edge: > 5% through 15%
 * - Lopsided: > 15%
 *
 * Run: npm run verify:trade-verdict-tiers
 */

import assert from "node:assert/strict";
import {
  verdictTierFromGap,
  whoBenefitsCopy,
} from "../src/lib/insights/trade-benefits";

// UAT repro: 18.6 vs 19.9 → gap 1.3 / 19.9 ≈ 6.5% → Slight edge, not Lopsided.
{
  const a = 18.6;
  const b = 19.9;
  const gap = b - a;
  const copy = whoBenefitsCopy(gap, "free", a, b);
  assert.equal(verdictTierFromGap(Math.abs(gap), Math.max(a, b)), "slight_edge");
  assert.equal(copy.winner, "b");
  assert.match(copy.headline, /^Slight edge:/);
  assert.match(copy.headline, /Side B gets 1\.3 more points of value\./);
  assert.ok(!/Lopsided/i.test(copy.headline));
  assert.ok(!/shouldn't accept/i.test(copy.headline));
}

// > 15% of larger side → Lopsided
{
  const a = 20;
  const b = 16; // gap 4 / 20 = 20%
  const copy = whoBenefitsCopy(b - a, "free", a, b);
  assert.equal(verdictTierFromGap(4, 20), "lopsided");
  assert.equal(copy.winner, "a");
  assert.match(copy.headline, /^Lopsided:/);
  assert.match(copy.headline, /shouldn't accept/i);
}

// Exactly 15% → Slight edge (Lopsided only when more than 15%)
{
  assert.equal(verdictTierFromGap(3, 20), "slight_edge");
  const copy = whoBenefitsCopy(-3, "free", 20, 17);
  assert.match(copy.headline, /^Slight edge:/);
}

// 5–15% band → Slight edge (just above 5%)
{
  // 10 vs 10.6 → 0.6 / 10.6 ≈ 5.66%
  const copy = whoBenefitsCopy(0.6, "free", 10, 10.6);
  assert.equal(verdictTierFromGap(0.6, 10.6), "slight_edge");
  assert.match(copy.headline, /^Slight edge:/);
  assert.equal(copy.differenceLabel, "+0.6 for Side B");
}

// ≤ 5% → Even (old EVEN_EPS=0.5 would have called 18.6 vs 19.1 lopsided)
{
  const a = 20;
  const b = 20.8; // 0.8 / 20.8 ≈ 3.85%
  const copy = whoBenefitsCopy(b - a, "free", a, b);
  assert.equal(verdictTierFromGap(0.8, 20.8), "even");
  assert.equal(copy.winner, "even");
  assert.match(copy.headline, /^Even:/);
  assert.equal(copy.differenceLabel, "Even");
}

// Exactly 5% → Even
{
  assert.equal(verdictTierFromGap(1, 20), "even");
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
