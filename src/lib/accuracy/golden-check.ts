/**
 * Golden sample re-validation for weekly cron + Insights notice.
 * Compares PlayerWeekStat (leagueId="", prefer nflverse_ppr) to
 * tests/fixtures/golden-players.json full-PPR expectations.
 *
 * Also asserts Who to Start / Trade Analyzer tool outputs for fixture
 * players: full name + team labels, week PPR strips match nflverse,
 * verdict edge equals projection gap (never a defense-sample number).
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { NFLVERSE_LEAGUE_ID } from "@/lib/nflverse/map";
import { normalizeOpponentAbbrev } from "@/lib/insights/defense-matchups";
import { formatPlayerLabel } from "@/lib/insights/player-label";
import { weekCellsFromPlayer } from "@/lib/insights/tool-display";
import { compareWhoToStart } from "@/lib/insights/who-to-start";
import { comparePlayerPackages } from "@/lib/insights/trade-analyzer";
import type { FantasyPlayer, LeagueData, PlayerPosition } from "@/lib/types";

export const GOLDEN_CHECK_LEAGUE_ID = "__gridiron_accuracy__";
export const GOLDEN_CHECK_VIEW = "golden_check";

export type GoldenCheckResult = {
  ok: boolean;
  mode: "stub" | "assert";
  season: number;
  checkedAt: string;
  failureCount: number;
  failures: string[];
  playersChecked: number;
};

type ExpectedWeek = {
  week: number;
  actualPpr: number | null;
  targets: number | null;
  carries: number | null;
  opponent: string | null;
  /** Documented in fixture; not asserted (nflverse snap %). */
  snapPct?: number | null;
};

type FixturePlayer = {
  espnId: number;
  name: string;
  /** Optional position from researcher dump (used by seed script). */
  position?: string;
  surfaces?: string[];
  expected: {
    nflTeam: string | null;
    opponent: string | null;
    weeks: ExpectedWeek[];
  };
};

type GoldenFixture = {
  version: number;
  mode: "stub" | "assert";
  season: number;
  surfaces?: string[];
  players: FixturePlayer[];
};

const PPR_TOL = 0.06;

function fixturePath(): string {
  return path.join(process.cwd(), "tests/fixtures/golden-players.json");
}

export function loadGoldenFixture(): GoldenFixture {
  const raw = JSON.parse(
    fs.readFileSync(fixturePath(), "utf8"),
  ) as GoldenFixture;
  return raw;
}

function opponentsMatch(
  actual: string | null | undefined,
  expected: string,
): boolean {
  if (!actual) return false;
  const a = normalizeOpponentAbbrev(actual);
  const e = normalizeOpponentAbbrev(expected) ?? expected.trim().toUpperCase();
  if (a && e && a === e) return true;
  return actual.trim().toUpperCase() === expected.trim().toUpperCase();
}

/**
 * Run golden comparison. Stub mode → ok with no field asserts.
 * Null expected fields are skipped (unknown, not 0).
 */
export async function runGoldenAccuracyCheck(): Promise<GoldenCheckResult> {
  const fixture = loadGoldenFixture();
  const checkedAt = new Date().toISOString();

  if (fixture.mode === "stub") {
    return {
      ok: true,
      mode: "stub",
      season: fixture.season,
      checkedAt,
      failureCount: 0,
      failures: [],
      playersChecked: fixture.players.length,
    };
  }

  const failures: string[] = [];

  for (const fp of fixture.players) {
    const player = await prisma.player.findFirst({
      where: { espnId: fp.espnId },
    });
    if (!player) {
      failures.push(`${fp.name} (${fp.espnId}): missing from DB`);
      continue;
    }

    if (fp.expected.nflTeam != null) {
      const actual = (player.nflTeam ?? "").toUpperCase();
      const expected = fp.expected.nflTeam.toUpperCase();
      if (actual !== expected) {
        failures.push(
          `${fp.name}: nflTeam expected ${expected}, got ${actual || "—"}`,
        );
      }
    }

    const weekRows = await prisma.playerWeekStat.findMany({
      where: {
        espnId: fp.espnId,
        season: fixture.season,
        leagueId: NFLVERSE_LEAGUE_ID,
      },
      orderBy: [{ week: "asc" }, { updatedAt: "desc" }],
    });

    const byWeek = new Map<number, (typeof weekRows)[number]>();
    for (const r of weekRows) {
      const prev = byWeek.get(r.week);
      if (!prev) {
        byWeek.set(r.week, r);
        continue;
      }
      const prefer =
        r.actualSource === "nflverse_ppr" &&
        prev.actualSource !== "nflverse_ppr"
          ? r
          : prev.actualSource === "nflverse_ppr"
            ? prev
            : prev;
      byWeek.set(r.week, prefer);
    }

    for (const ew of fp.expected.weeks) {
      const row = byWeek.get(ew.week);
      const label = `${fp.name} W${ew.week}`;

      // All scoring fields null = unknown week (no assertable stat row).
      // Keep opponent/snapPct in the fixture for docs; do not treat as 0.
      const scoringUnknown =
        ew.actualPpr == null && ew.targets == null && ew.carries == null;
      if (scoringUnknown) continue;

      if (ew.actualPpr != null) {
        const actual = row?.actualPpr;
        if (
          actual == null ||
          !Number.isFinite(actual) ||
          Math.abs(actual - ew.actualPpr) > PPR_TOL
        ) {
          failures.push(
            `${label}: actualPpr expected ${ew.actualPpr}, got ${actual ?? "—"}`,
          );
        }
      }
      if (ew.targets != null && row?.targets !== ew.targets) {
        failures.push(
          `${label}: targets expected ${ew.targets}, got ${row?.targets ?? "—"}`,
        );
      }
      if (ew.carries != null && row?.carries !== ew.carries) {
        failures.push(
          `${label}: carries expected ${ew.carries}, got ${row?.carries ?? "—"}`,
        );
      }
      if (ew.opponent != null && !opponentsMatch(row?.opponent, ew.opponent)) {
        failures.push(
          `${label}: opponent expected ${ew.opponent}, got ${row?.opponent ?? "—"}`,
        );
      }
    }
  }

  // ── Tool surfaces: Who to Start + Trade Analyzer outputs ──
  await assertToolSurfaces(fixture, failures);

  return {
    ok: failures.length === 0,
    mode: "assert",
    season: fixture.season,
    checkedAt,
    failureCount: failures.length,
    failures: failures.slice(0, 40),
    playersChecked: fixture.players.length,
  };
}

function fantasyFromFixture(
  fp: FixturePlayer,
  weekRows: Map<number, { actualPpr: number | null; opponent: string | null }>,
): FantasyPlayer {
  const team = (fp.expected.nflTeam ?? "FA").toUpperCase();
  const recentWeeks = fp.expected.weeks
    .filter((w) => w.actualPpr != null)
    .map((w) => ({
      week: w.week,
      points: w.actualPpr as number,
      opponent: w.opponent ?? weekRows.get(w.week)?.opponent ?? undefined,
    }));
  const last = [...fp.expected.weeks].sort((a, b) => b.week - a.week)[0];
  return {
    id: `golden-${fp.espnId}`,
    espnId: fp.espnId,
    name: fp.name,
    position: (fp.position as PlayerPosition) || "WR",
    nflTeam: team,
    injuryStatus: "ACTIVE",
    projectedPoints: last?.actualPpr ?? 10,
    actualPoints: 0,
    percentOwned: 50,
    percentStarted: 40,
    recentWeeks,
    opponent: fp.expected.opponent ?? undefined,
  };
}

function phantomLeague(season: number, players: FantasyPlayer[]): LeagueData {
  const week = Math.max(
    1,
    ...players.flatMap((p) => (p.recentWeeks ?? []).map((w) => w.week + 1)),
    1,
  );
  return {
    leagueId: "golden-tools",
    name: "Golden",
    season,
    scoringPeriodId: week,
    currentWeek: week,
    teams: [
      {
        id: 1,
        name: "A",
        abbrev: "A",
        ownerName: "A",
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        standing: 1,
        roster: players,
        isCurrentUser: true,
      },
    ],
    matchups: [],
    freeAgents: [],
    userTeamId: 1,
    isDemo: false,
    lastSyncedAt: new Date().toISOString(),
  };
}

async function assertToolSurfaces(
  fixture: GoldenFixture,
  failures: string[],
): Promise<void> {
  const toolPlayers = fixture.players.filter((p) => {
    const surfaces = p.surfaces ?? fixture.surfaces ?? [];
    return (
      surfaces.includes("who-to-start") || surfaces.includes("trade")
    );
  });
  if (!toolPlayers.length) return;

  const built: FantasyPlayer[] = [];
  for (const fp of toolPlayers) {
    const weekRows = await prisma.playerWeekStat.findMany({
      where: {
        espnId: fp.espnId,
        season: fixture.season,
        leagueId: NFLVERSE_LEAGUE_ID,
      },
    });
    const byWeek = new Map<
      number,
      { actualPpr: number | null; opponent: string | null }
    >();
    for (const r of weekRows) {
      byWeek.set(r.week, {
        actualPpr: r.actualPpr,
        opponent: r.opponent,
      });
    }
    const player = fantasyFromFixture(fp, byWeek);
    built.push(player);

    const label = formatPlayerLabel(player.name, player.nflTeam);
    if (fp.expected.nflTeam) {
      const team = fp.expected.nflTeam.toUpperCase();
      if (!label.includes(`(${team})`)) {
        failures.push(
          `tool-label ${fp.name}: expected full name + (${team}), got "${label}"`,
        );
      }
    }

    // Week strip cells must match fixture full-PPR (same path Trade/WTS use).
    const through = Math.max(
      0,
      ...fp.expected.weeks
        .filter((w) => w.actualPpr != null)
        .map((w) => w.week),
    );
    const cells = weekCellsFromPlayer({
      player,
      currentWeek: through + 1,
      statsThroughWeek: through,
      sleeperProj: player.projectedPoints,
    });
    for (const ew of fp.expected.weeks) {
      if (ew.actualPpr == null) continue;
      const cell = cells.find((c) => c.week === ew.week);
      if (!cell || cell.kind !== "played" || cell.value == null) {
        failures.push(
          `who-to-start/trade strip ${fp.name} W${ew.week}: expected played ${ew.actualPpr}, got ${cell?.kind ?? "missing"}/${cell?.value ?? "—"}`,
        );
        continue;
      }
      if (Math.abs(cell.value - ew.actualPpr) > PPR_TOL) {
        failures.push(
          `who-to-start/trade strip ${fp.name} W${ew.week}: expected ${ew.actualPpr}, got ${cell.value}`,
        );
      }
    }
  }

  const league = phantomLeague(fixture.season, built);

  // Who to Start: same-position pair → labels + edge === proj gap
  const wtsPlayers = built.filter((_, i) => {
    const surfaces =
      toolPlayers[i]?.surfaces ?? fixture.surfaces ?? [];
    return surfaces.includes("who-to-start");
  });
  const byPos = new Map<string, FantasyPlayer[]>();
  for (const p of wtsPlayers) {
    const list = byPos.get(p.position) ?? [];
    list.push(p);
    byPos.set(p.position, list);
  }
  for (const [, group] of byPos) {
    if (group.length < 2) continue;
    const a = group[0]!;
    const b = group[1]!;
    const result = compareWhoToStart(league, a, b);
    if (!result.ok) {
      failures.push(
        `who-to-start ${a.name} vs ${b.name}: ${result.message}`,
      );
      continue;
    }
    const labelA = formatPlayerLabel(a.name, a.nflTeam);
    const labelB = formatPlayerLabel(b.name, b.nflTeam);
    if (!result.headline.includes(labelA) && !result.headline.includes(labelB)) {
      failures.push(
        `who-to-start headline missing full name+team: "${result.headline}"`,
      );
    }
    const projEdge = a.projectedPoints - b.projectedPoints;
    // When neither is injured, edge must equal projection gap (not defense sample).
    if (
      a.injuryStatus === "ACTIVE" &&
      b.injuryStatus === "ACTIVE" &&
      Math.abs(result.edge - projEdge) > 0.05 &&
      Math.abs(projEdge) >= 1.0
    ) {
      failures.push(
        `who-to-start edge for ${labelA} vs ${labelB}: expected proj gap ${projEdge.toFixed(1)}, got ${result.edge.toFixed(1)} (must not reuse defense-sample averages)`,
      );
    }
    for (const reason of result.reasons) {
      if (/\bOpp\b|\bTGT%|\bszn\b|\b3wk\b/i.test(reason)) {
        failures.push(
          `who-to-start jargon in reason: "${reason.slice(0, 80)}"`,
        );
      }
    }
    break; // one pair is enough for the gate
  }

  // Trade Analyzer: package compare must name players with team
  const tradePlayers = built.filter((_, i) => {
    const surfaces =
      toolPlayers[i]?.surfaces ?? fixture.surfaces ?? [];
    return surfaces.includes("trade");
  });
  if (tradePlayers.length >= 2) {
    const a = tradePlayers[0]!;
    const b = tradePlayers[1]!;
    const analysis = comparePlayerPackages([a], [b]);
    if (!analysis) {
      failures.push("trade comparePlayerPackages returned null");
    } else {
      const labelA = formatPlayerLabel(a.name, a.nflTeam);
      const labelB = formatPlayerLabel(b.name, b.nflTeam);
      const blob = [...analysis.facts, ...analysis.forYou].join(" | ");
      if (!blob.includes(labelA) || !blob.includes(labelB)) {
        failures.push(
          `trade facts missing full name+team (${labelA} / ${labelB})`,
        );
      }
      if (/\bOpp\b|\bTGT%|\bszn\b|\b3wk\b/i.test(blob)) {
        failures.push("trade facts contain banned jargon (Opp/TGT%/szn/3wk)");
      }
      // Value gap shown must match give/receive chip totals (no invented edge).
      const expectedGap = analysis.receiveValue - analysis.giveValue;
      if (Math.abs(analysis.valueGap - expectedGap) > 0.05) {
        failures.push(
          `trade valueGap ${analysis.valueGap} != receive−give ${expectedGap}`,
        );
      }
    }
  }
}

/** Persist last check for Insights banner (uses EspnRawResponse sentinel). */
export async function persistGoldenCheckResult(
  result: GoldenCheckResult,
): Promise<void> {
  await prisma.espnRawResponse.upsert({
    where: {
      espnLeagueId_season_view_week: {
        espnLeagueId: GOLDEN_CHECK_LEAGUE_ID,
        season: result.season,
        view: GOLDEN_CHECK_VIEW,
        week: 0,
      },
    },
    create: {
      espnLeagueId: GOLDEN_CHECK_LEAGUE_ID,
      season: result.season,
      view: GOLDEN_CHECK_VIEW,
      week: 0,
      body: result as object,
      fetchedAt: new Date(result.checkedAt),
    },
    update: {
      body: result as object,
      fetchedAt: new Date(result.checkedAt),
    },
  });
}

export async function loadLatestGoldenCheckResult(
  season: number,
): Promise<GoldenCheckResult | null> {
  const row = await prisma.espnRawResponse.findUnique({
    where: {
      espnLeagueId_season_view_week: {
        espnLeagueId: GOLDEN_CHECK_LEAGUE_ID,
        season,
        view: GOLDEN_CHECK_VIEW,
        week: 0,
      },
    },
  });
  if (!row?.body || typeof row.body !== "object") return null;
  return row.body as GoldenCheckResult;
}
