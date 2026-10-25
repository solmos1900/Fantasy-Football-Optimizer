/**
 * Fail if a chat player card's trend text or opponent doesn't match that
 * player's own data (no copy-pasted form lines / shared opponents).
 * Run: npx tsx scripts/verify-chat-card-consistency.ts
 */

import assert from "node:assert/strict";
import {
  buildPlayerMetricCard,
  runTradeCompare,
  runWhoToStartCompare,
} from "../src/lib/chat/tool-runners";
import { formImpactLine } from "../src/lib/insights/tool-display";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";
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
    injuryStatus: partial.injuryStatus ?? "ACTIVE",
    projectedPoints:
      partial.projectedPoints !== undefined ? partial.projectedPoints : 14,
    actualPoints: null,
    percentOwned: 80,
    percentStarted: 70,
    opponent: partial.opponent,
    recentWeeks: partial.recentWeeks ?? [],
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

const puka = player({
  espnId: 4432577,
  name: "Puka Nacua",
  nflTeam: "LAR",
  opponent: "@JAX",
  projectedPoints: 16.4,
  recentWeeks: [
    { week: 3, points: 14.2 },
    { week: 4, points: 18.1 },
    { week: 5, points: 16.0 },
    { week: 6, points: 20.2 },
  ],
});

const kyren = player({
  espnId: 4427366,
  name: "Kyren Williams",
  nflTeam: "LAR",
  opponent: "@JAX",
  projectedPoints: 15.1,
  recentWeeks: [
    { week: 3, points: 12.0 },
    { week: 4, points: 11.5 },
    { week: 5, points: 13.2 },
    { week: 6, points: 10.8 },
  ],
});

const chase = player({
  espnId: 4362628,
  name: "Ja'Marr Chase",
  nflTeam: "CIN",
  opponent: "PIT",
  projectedPoints: 17.8,
  recentWeeks: [
    { week: 3, points: 22.0 },
    { week: 4, points: 19.5 },
    { week: 5, points: 21.0 },
    { week: 6, points: 18.4 },
  ],
});

const dk = player({
  espnId: 4047650,
  name: "DK Metcalf",
  nflTeam: "PIT",
  opponent: "@CIN",
  projectedPoints: 13.2,
  recentWeeks: [
    { week: 3, points: 14.0 },
    { week: 4, points: 11.0 },
    { week: 5, points: 12.2 },
    { week: 6, points: 10.0 },
  ],
});

// Each card's opponent + formLine must equal that player's own fields / formImpactLine
for (const p of [puka, kyren, chase, dk]) {
  const card = buildPlayerMetricCard(p);
  assert.equal(
    card.opponent ?? null,
    p.opponent ?? null,
    `${p.name} opponent mismatch`,
  );
  assert.equal(
    card.formLine,
    formImpactLine(p),
    `${p.name} formLine must come from formImpactLine(player)`,
  );
  assert.equal(card.byeThisWeek, (p.opponent ?? "").toUpperCase() === "BYE");
  // Trend direction must agree with last3 vs season on THIS player
  if (card.formLine && card.last3Avg != null && card.seasonPpg != null) {
    const up = card.last3Avg > card.seasonPpg * 1.15;
    const down = card.last3Avg < card.seasonPpg * 0.85;
    if (up) assert.match(card.formLine, /trending up/);
    if (down) assert.match(card.formLine, /trending down/);
    if (!up && !down) assert.match(card.formLine, /holding steady/);
  }
}

// DK must NOT inherit Puka's form numbers
{
  const dkCard = buildPlayerMetricCard(dk);
  const pukaCard = buildPlayerMetricCard(puka);
  assert.notEqual(dkCard.formLine, pukaCard.formLine);
  assert.ok(dkCard.formLine == null || !/18\.1/.test(dkCard.formLine));
  assert.ok(dkCard.last3Avg != null && dkCard.last3Avg < 13);
  assert.match(dkCard.formLine ?? "", /trending down|holding steady/);
}

// Trade runner: each side card matches its own player
{
  const trade = runTradeCompare({
    sideA: [puka, kyren],
    sideB: [chase, dk],
    freshness,
  });
  assert.equal(trade.ok, true);
  if (!trade.ok) throw new Error("trade failed");
  const byId = new Map(
    [...trade.sideA, ...trade.sideB].map((c) => [c.espnId, c]),
  );
  for (const p of [puka, kyren, chase, dk]) {
    const card = byId.get(p.espnId);
    assert.ok(card, `missing card for ${p.name}`);
    assert.equal(card!.opponent ?? null, p.opponent ?? null);
    assert.equal(card!.formLine, formImpactLine(p));
    assert.equal(card!.label.includes(p.nflTeam), true);
  }
  // No shared fake @SEA
  for (const c of [...trade.sideA, ...trade.sideB]) {
    assert.notEqual(c.opponent, "@SEA");
  }
}

// Who-to-start runner: same per-player consistency
{
  const league: LeagueData = {
    leagueId: "chat-consistency",
    season: 2026,
    name: "Test",
    currentWeek: 7,
    scoringPeriodId: 7,
    isDemo: false,
    teams: [],
    matchups: [],
    freeAgents: [puka, dk],
    lastSyncedAt: new Date().toISOString(),
  };
  const wts = runWhoToStartCompare({
    league,
    players: [puka, dk],
    freshness,
  });
  assert.equal(wts.ok, true);
  if (!wts.ok) throw new Error("wts failed");
  for (const card of wts.players) {
    const src = [puka, dk].find((p) => p.espnId === card.espnId)!;
    assert.equal(card.opponent ?? null, src.opponent ?? null);
    assert.equal(card.formLine, formImpactLine(src));
  }
}

// Live screenshot sample (Week 7 public feeds) must keep per-player consistency
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sample = require("../src/app/ui-preview/chat/live-sample.json") as {
    trade: {
      toolOutput: {
        ok: boolean;
        sideA: Array<{
          espnId: number;
          opponent: string | null;
          formLine: string | null;
          last3Avg: number | null;
          seasonPpg: number | null;
        }>;
        sideB: Array<{
          espnId: number;
          opponent: string | null;
          formLine: string | null;
          last3Avg: number | null;
          seasonPpg: number | null;
        }>;
        freshness: { statsThroughWeek: number };
      };
    };
    whoToStart: {
      toolOutput: {
        players: Array<{
          espnId: number;
          opponent: string | null;
          formLine: string | null;
          last3Avg: number | null;
          seasonPpg: number | null;
        }>;
      };
    };
    sources: {
      players: Array<{
        espnId: number;
        opponent: { value: string | null };
        formLine: { value: string | null };
      }>;
    };
  };
  const cards = [
    ...sample.trade.toolOutput.sideA,
    ...sample.trade.toolOutput.sideB,
    ...sample.whoToStart.toolOutput.players,
  ];
  const byEspn = new Map(
    sample.sources.players.map((s) => [s.espnId, s] as const),
  );
  for (const card of cards) {
    const src = byEspn.get(card.espnId);
    assert.ok(src, `live-sample missing sources for espn ${card.espnId}`);
    assert.equal(
      card.opponent,
      src!.opponent.value,
      `live-sample opponent drift for ${card.espnId}`,
    );
    assert.equal(
      card.formLine,
      src!.formLine.value,
      `live-sample formLine drift for ${card.espnId}`,
    );
    assert.notEqual(card.opponent, "@SEA");
    if (card.formLine && card.last3Avg != null && card.seasonPpg != null) {
      const up = card.last3Avg > card.seasonPpg * 1.15;
      const down = card.last3Avg < card.seasonPpg * 0.85;
      if (up) assert.match(card.formLine, /trending up/);
      if (down) assert.match(card.formLine, /trending down/);
      if (!up && !down) assert.match(card.formLine, /holding steady/);
      // formLine numbers must be THIS player's last3 / season (not copy-paste)
      assert.match(
        card.formLine,
        new RegExp(
          `avg ${card.last3Avg.toFixed(1)} vs season ${card.seasonPpg.toFixed(1)}`,
        ),
      );
    }
  }
  assert.equal(sample.trade.toolOutput.freshness.statsThroughWeek, 6);
}

console.log("verify-chat-card-consistency: ok");
