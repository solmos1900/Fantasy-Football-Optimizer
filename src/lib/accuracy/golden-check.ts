/**
 * Golden sample re-validation for weekly cron + Insights notice.
 * Compares PlayerWeekStat (leagueId="", prefer nflverse_ppr) to
 * tests/fixtures/golden-players.json full-PPR expectations.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { NFLVERSE_LEAGUE_ID } from "@/lib/nflverse/map";
import { normalizeOpponentAbbrev } from "@/lib/insights/defense-matchups";

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
};

type FixturePlayer = {
  espnId: number;
  name: string;
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

      // null expected = unknown (no stat row) — do not treat as 0
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
