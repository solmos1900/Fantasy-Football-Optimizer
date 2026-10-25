/**
 * Unit guard: Trade Analyzer winner / difference / plain verdict must agree.
 * Verdict tiers are percentage-based (<5% even, 5–15% slight edge, >15% lopsided).
 * Run: npm run verify:trade-benefits
 */

import assert from "node:assert/strict";
import {
  bothSidesHaveValue,
  tradeRelativeGapPct,
  tradeVerdictTierFromPct,
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

// ── Percentage tiers (shared helpers) ──
{
  assert.equal(tradeVerdictTierFromPct(0.049), "even");
  assert.equal(tradeVerdictTierFromPct(0.05), "slight_edge");
  assert.equal(tradeVerdictTierFromPct(0.1), "slight_edge");
  assert.equal(tradeVerdictTierFromPct(0.15), "slight_edge");
  assert.equal(tradeVerdictTierFromPct(0.16), "lopsided");

  // 28.1 vs 32.3 ≈ 14.9% of the lower side → slight edge (not lopsided)
  const pct = tradeRelativeGapPct(28.1, 32.3);
  assert.ok(pct > 0.14 && pct < 0.15, `expected ~14.9%, got ${pct}`);
  assert.equal(tradeVerdictTierFromPct(pct), "slight_edge");
}

// ── Critical: Left 17.8, Right 0 → Left ahead; lopsided; difference never negative ──
{
  const giveValue = 17.8;
  const receiveValue = 0.0;
  const gap = receiveValue - giveValue; // -17.8
  const free = whoBenefitsCopy(gap, "free", giveValue, receiveValue);
  assert.equal(free.winner, "a");
  assert.equal(free.tier, "lopsided");
  assert.equal(free.tone, "caution");
  assert.match(free.headline, /Lopsided: Left gets 17\.8 more/i);
  assert.match(free.headline, /Right shouldn't accept/i);
  assert.ok(!/Side A|Side B|chip value/i.test(free.headline));
  assert.ok(!/HARD REJECT|wins this deal/i.test(free.headline));
  assert.equal(free.differenceLabel, "+17.8 for Left");
  assert.ok(!free.differenceLabel.includes("-"));

  const team = whoBenefitsCopy(gap, "team", giveValue, receiveValue);
  assert.equal(team.winner, "a");
  assert.equal(team.tone, "caution");
  assert.match(team.headline, /You give 17\.8 more/i);
  assert.match(team.headline, /you shouldn't accept/i);
  assert.equal(team.differenceLabel, "+17.8 for Them");
}

// Right higher by ~45% → lopsided
{
  const giveValue = 8;
  const receiveValue = 14.5;
  const gap = receiveValue - giveValue; // +6.5
  const free = whoBenefitsCopy(gap, "free", giveValue, receiveValue);
  assert.equal(free.winner, "b");
  assert.equal(free.tier, "lopsided");
  assert.match(free.headline, /Lopsided: Right gets 6\.5 more/i);
  assert.match(free.headline, /Left shouldn't accept/i);
  assert.equal(free.differenceLabel, "+6.5 for Right");

  const team = whoBenefitsCopy(gap, "team", giveValue, receiveValue);
  assert.equal(team.winner, "b");
  assert.match(team.headline, /You get 6\.5 more/i);
  assert.match(team.headline, /they shouldn't accept/i);
  assert.equal(team.differenceLabel, "+6.5 for You");
}

// Bijan 17.8 vs Downs 6.3 → ~65% → lopsided Left
{
  const copy = whoBenefitsCopy(-11.5, "free", 17.8, 6.3);
  assert.equal(copy.winner, "a");
  assert.equal(copy.tier, "lopsided");
  assert.equal(copy.differenceLabel, "+11.5 for Left");
  assert.match(
    copy.headline,
    /Lopsided: Left gets 11\.5 more points of value/,
  );
}

// 10% slight edge (100 vs 110)
{
  const copy = whoBenefitsCopy(10, "free", 100, 110);
  assert.equal(copy.tier, "slight_edge");
  assert.equal(copy.tone, "caution");
  assert.match(copy.headline, /Slight edge: Right gets/i);
  assert.match(copy.headline, /Left shouldn't accept/i);
  assert.ok(!/Lopsided/i.test(copy.headline));
}

// 4.9% even (100 vs 104.9)
{
  const even = whoBenefitsCopy(4.9, "free", 100, 104.9);
  assert.equal(even.winner, "even");
  assert.equal(even.tier, "even");
  assert.equal(even.tone, "neutral");
  assert.match(even.headline, /even/i);
  assert.equal(even.differenceLabel, "Even");
}

// 16% lopsided (100 vs 116)
{
  const lop = whoBenefitsCopy(16, "free", 100, 116);
  assert.equal(lop.tier, "lopsided");
  assert.match(lop.headline, /Lopsided/i);
}

// Near-even absolute gap but check % still drives tier when both large
{
  const even = whoBenefitsCopy(0.2, "free", 10, 10.1);
  assert.equal(even.winner, "even");
  assert.match(even.headline, /even/i);
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
  if (copy.tier === "even") {
    assert.equal(copy.winner, "even");
  } else if (gap > 0) {
    assert.equal(copy.winner, "b", `gap=${gap}`);
    assert.match(copy.differenceLabel, /^\+/);
    assert.match(copy.differenceLabel, /Right/);
  } else {
    assert.equal(copy.winner, "a", `gap=${gap}`);
    assert.match(copy.differenceLabel, /^\+/);
    assert.match(copy.differenceLabel, /Left/);
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

  // WHY form / proj lines: leader view, no bare negatives (Bijan 26.3 vs Gibbs 32.3)
  const bijanForm = player({
    id: "bijan-form",
    name: "Bijan Robinson",
    nflTeam: "ATL",
    opponent: "CHI",
    projectedPoints: 25.6,
    recentWeeks: [
      { week: 3, points: 35.3 },
      { week: 4, points: 27.7 },
      { week: 5, points: 15.8 },
    ],
  });
  const gibbsForm = player({
    id: "gibbs-form",
    name: "Jahmyr Gibbs",
    nflTeam: "DET",
    opponent: "BYE",
    projectedPoints: 0,
    recentWeeks: [
      { week: 3, points: 41.4 },
      { week: 4, points: 17.7 },
      { week: 5, points: 37.7 },
    ],
  });
  const formCmp = compareWhoToStart(league, bijanForm, gibbsForm);
  assert.equal(formCmp.ok, true);
  if (formCmp.ok) {
    const formLine = formCmp.reasons.find((r) => r.startsWith("Recent form:"));
    assert.ok(formLine, "missing Recent form reason");
    assert.match(
      formLine!,
      /Recent form: Jahmyr Gibbs \(DET\) has averaged 6\.0 more points per game over the last 3 games \(32\.3 vs 26\.3\)\./,
    );
    assert.ok(!/about -/i.test(formLine!));
    assert.ok(!/ -?\d+\.\d+ points per game vs /i.test(formLine!));

    const projLine = formCmp.reasons.find((r) =>
      r.startsWith("Projected this week"),
    );
    assert.ok(projLine);
    // Leader is Bijan on proj (25.6 vs 0) — positive for leader, never "-X for A"
    assert.match(projLine!, /\(\+25\.6 for Bijan Robinson \(ATL\)\)/);
    assert.ok(!/\(-/.test(projLine!));

    for (const line of formCmp.reasons) {
      assert.ok(
        !/about\s+-\d/.test(line),
        `WHY line has negative-from-A wording: ${line}`,
      );
    }
  }
}

console.log("verify-trade-benefits: ok");
