/**
 * Regression (#129): Trade chip value = season fantasy PPG from played weeks.
 * Bye / missing this-week projection must not zero a player out.
 *
 * Run: npm run verify:trade-value-ppg
 */

import assert from "node:assert/strict";
import {
  chipValue,
  chipValueOrNull,
  seasonPointsPerGame,
  tierOf,
} from "../src/lib/insights/trade-value";
import type { FantasyPlayer } from "../src/lib/types";

function player(
  partial: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "name" | "nflTeam" | "espnId">,
): FantasyPlayer {
  return {
    id: partial.id ?? `id-${partial.espnId}`,
    espnId: partial.espnId,
    name: partial.name,
    position: partial.position ?? "QB",
    nflTeam: partial.nflTeam,
    injuryStatus: partial.injuryStatus ?? "ACTIVE",
    projectedPoints:
      partial.projectedPoints === undefined ? 20 : partial.projectedPoints,
    actualPoints: 0,
    percentOwned: 99,
    percentStarted: 99,
    opponent: partial.opponent,
    recentWeeks: partial.recentWeeks,
  };
}

// Allen on bye: Week-7 proj 0 must not crush value below Burrow.
{
  const allenWeeks = [
    { week: 1, points: 28.1 },
    { week: 2, points: 24.2 },
    { week: 3, points: 31.0 },
    { week: 4, points: 22.4 },
    { week: 5, points: 30.5 },
    { week: 6, points: 25.1 },
  ];
  const burrowWeeks = [
    { week: 1, points: 18.2 },
    { week: 2, points: 16.4 },
    { week: 3, points: 22.58 },
    { week: 4, points: 14.1 },
    { week: 5, points: 19.3 },
    { week: 6, points: 17.0 },
  ];
  const allen = player({
    espnId: 3918298,
    name: "Josh Allen",
    nflTeam: "BUF",
    position: "QB",
    opponent: "BYE",
    projectedPoints: 0,
    recentWeeks: allenWeeks,
  });
  const burrow = player({
    espnId: 3915511,
    name: "Joe Burrow",
    nflTeam: "CIN",
    position: "QB",
    opponent: "vs PIT",
    projectedPoints: 21.4,
    recentWeeks: burrowWeeks,
  });

  const allenPpg = seasonPointsPerGame(allen)!;
  const burrowPpg = seasonPointsPerGame(burrow)!;
  assert.ok(allenPpg > burrowPpg, `Allen PPG ${allenPpg} should beat Burrow ${burrowPpg}`);

  const allenChip = chipValue(allen);
  const burrowChip = chipValue(burrow);
  assert.ok(
    allenChip > burrowChip,
    `Allen chip ${allenChip.toFixed(2)} should be above Burrow ${burrowChip.toFixed(2)} while BUF is on bye`,
  );
  assert.equal(tierOf(allen), "elite");
  assert.ok(tierOf(allen) !== "streamer");

  // Old bye-zero blend would have been ~(0*0.3 + ppg*0.7)*0.45
  const oldByeBlend = (0 * 0.3 + allenPpg * 0.7) * 0.45;
  assert.ok(
    allenChip > oldByeBlend + 1,
    `season PPG chip (${allenChip.toFixed(2)}) should beat bye-zero blend (${oldByeBlend.toFixed(2)})`,
  );
}

// Missing projection must not zero a player who has scored weeks.
{
  const pitts = player({
    espnId: 4362626,
    name: "Kyle Pitts",
    nflTeam: "ATL",
    position: "TE",
    opponent: "vs SEA",
    projectedPoints: null,
    recentWeeks: [
      { week: 1, points: 8.2 },
      { week: 2, points: 11.4 },
      { week: 3, points: 6.8 },
      { week: 4, points: 9.1 },
    ],
  });
  const ppg = seasonPointsPerGame(pitts)!;
  const chip = chipValue(pitts);
  const asNull = chipValueOrNull(pitts);
  assert.ok(ppg > 0);
  assert.ok(chip > 0, `missing proj must not zero chip (got ${chip})`);
  assert.equal(asNull, chip);
  // TE non-elite multiplier 1.05 on season PPG (no trend/injury)
  assert.ok(Math.abs(chip - ppg * 1.05) < 1e-9);
}

// Bye with no scored weeks and 0 proj → no invented chip.
{
  const noSample = player({
    espnId: 999001,
    name: "Unknown Bye",
    nflTeam: "BUF",
    position: "WR",
    opponent: "BYE",
    projectedPoints: 0,
    recentWeeks: [],
  });
  assert.equal(chipValueOrNull(noSample), null);
}

console.log("verify-trade-value-ppg: ok");
