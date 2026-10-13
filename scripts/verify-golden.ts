/**
 * Golden accuracy gate for Insights / Who-to-Start / Trade inputs.
 *
 * Loads tests/fixtures/golden-players.json and compares team, opponent,
 * weekly PPR, targets, and carries against PlayerWeekStat (leagueId="") +
 * live scoreboard opponent — the same sources those surfaces use.
 *
 * mode "stub"  → schema validation only (exit 0)
 * mode "assert" → fail on any non-null expected field mismatch
 *
 * Run: npm run verify:golden
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { fetchEspnScoreboard } from "../src/lib/espn/client";
import {
  formatOpponentLabel,
  parseEspnScoreboard,
  scheduleMapWithByes,
} from "../src/lib/espn/scoreboard";
import { normalizeOpponentAbbrev } from "../src/lib/insights/defense-matchups";
import { NFLVERSE_LEAGUE_ID } from "../src/lib/nflverse/map";
import { fetchNflWeekSnapshot } from "../src/lib/players/week";
import { defaultEspnSeason } from "../src/lib/season";

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
  description?: string;
  surfaces?: string[];
  players: FixturePlayer[];
};

const FIXTURE_PATH = path.join(
  process.cwd(),
  "tests/fixtures/golden-players.json",
);

const PPR_TOL = 0.05;

function loadFixture(): GoldenFixture {
  assert.ok(
    fs.existsSync(FIXTURE_PATH),
    `Missing fixture at ${FIXTURE_PATH}`,
  );
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as GoldenFixture;
  assert.ok(raw.version >= 1, "fixture.version must be >= 1");
  assert.ok(
    raw.mode === "stub" || raw.mode === "assert",
    'fixture.mode must be "stub" or "assert"',
  );
  assert.ok(Number.isFinite(raw.season) && raw.season >= 2020, "bad season");
  assert.ok(Array.isArray(raw.players) && raw.players.length > 0, "no players");

  for (const p of raw.players) {
    assert.ok(
      Number.isFinite(p.espnId) && p.espnId > 0,
      `player espnId required (${p.name ?? "?"})`,
    );
    assert.ok(
      typeof p.name === "string" && p.name.trim().length > 0,
      `player name required (${p.espnId})`,
    );
    assert.ok(p.expected && typeof p.expected === "object", `${p.name}: expected`);
    assert.ok(Array.isArray(p.expected.weeks), `${p.name}: expected.weeks`);
    for (const w of p.expected.weeks) {
      assert.ok(
        Number.isFinite(w.week) && w.week >= 1,
        `${p.name}: week number`,
      );
    }
  }
  return raw;
}

function hasAnyAssertedValue(p: FixturePlayer): boolean {
  const e = p.expected;
  if (e.nflTeam != null || e.opponent != null) return true;
  return e.weeks.some(
    (w) =>
      w.actualPpr != null ||
      w.targets != null ||
      w.carries != null ||
      w.opponent != null,
  );
}

function approxEqual(
  actual: number | null | undefined,
  expected: number,
  tol: number,
): boolean {
  if (actual == null || !Number.isFinite(actual)) return false;
  return Math.abs(actual - expected) <= tol;
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

async function main() {
  const fixture = loadFixture();
  console.log(
    JSON.stringify(
      {
        fixture: FIXTURE_PATH,
        mode: fixture.mode,
        season: fixture.season,
        players: fixture.players.length,
      },
      null,
      2,
    ),
  );

  if (fixture.mode === "stub") {
    for (const p of fixture.players) {
      if (hasAnyAssertedValue(p)) {
        console.warn(
          `warn: ${p.name} has non-null expected fields while mode=stub — ignored until mode=assert`,
        );
      }
    }
    console.log(
      "golden stub OK — structure valid; researcher must fill expected.* and set mode=assert",
    );
    return;
  }

  // mode === assert
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "verify:golden mode=assert requires DATABASE_URL (PlayerWeekStat lookup)",
    );
  }

  const prisma = new PrismaClient();
  const failures: string[] = [];

  try {
    const season = fixture.season || defaultEspnSeason();
    const snap = await fetchNflWeekSnapshot(season).catch(() => null);
    const currentWeek = snap?.currentWeek ?? 1;

    let currentOppByTeam = new Map<string, string>();
    try {
      const board = await fetchEspnScoreboard(currentWeek, season);
      const parsed = parseEspnScoreboard(
        board as Parameters<typeof parseEspnScoreboard>[0],
      );
      const teams = fixture.players.map((p) => p.expected.nflTeam).filter(
        (t): t is string => Boolean(t),
      );
      const schedule = scheduleMapWithByes(
        parsed.byTeam,
        parsed.eventCount,
        teams,
      );
      for (const team of new Set(
        [
          ...teams,
          ...[...parsed.byTeam.keys()],
        ].filter(Boolean),
      )) {
        const label = formatOpponentLabel(team, schedule);
        if (label) currentOppByTeam.set(team.toUpperCase(), label);
      }
    } catch (err) {
      console.warn(
        "scoreboard opponent enrich skipped:",
        err instanceof Error ? err.message : err,
      );
    }

    for (const fp of fixture.players) {
      const player = await prisma.player.findFirst({
        where: { espnId: fp.espnId },
      });
      if (!player) {
        failures.push(`${fp.name} (${fp.espnId}): player missing from DB`);
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

      if (fp.expected.opponent != null) {
        const team = (player.nflTeam ?? fp.expected.nflTeam ?? "").toUpperCase();
        const actual =
          currentOppByTeam.get(team) ??
          (
            await prisma.playerWeekStat.findFirst({
              where: {
                espnId: fp.espnId,
                season,
                leagueId: NFLVERSE_LEAGUE_ID,
                week: currentWeek,
                opponent: { not: null },
              },
              select: { opponent: true },
            })
          )?.opponent ??
          null;
        if (!opponentsMatch(actual, fp.expected.opponent)) {
          failures.push(
            `${fp.name}: current opponent expected ${fp.expected.opponent}, got ${actual ?? "—"}`,
          );
        }
      }

      const weekRows = await prisma.playerWeekStat.findMany({
        where: {
          espnId: fp.espnId,
          season,
          leagueId: NFLVERSE_LEAGUE_ID,
        },
        orderBy: [{ week: "asc" }, { updatedAt: "desc" }],
      });

      // Prefer one row per week (espn_public actuals when present).
      const byWeek = new Map<number, (typeof weekRows)[number]>();
      for (const r of weekRows) {
        const prev = byWeek.get(r.week);
        if (!prev) {
          byWeek.set(r.week, r);
          continue;
        }
        const prefer =
          r.actualSource === "espn_public" &&
          prev.actualSource !== "espn_public"
            ? r
            : prev.actualPpr == null && r.actualPpr != null
              ? r
              : prev;
        byWeek.set(r.week, prefer);
      }

      for (const ew of fp.expected.weeks) {
        const row = byWeek.get(ew.week);
        const label = `${fp.name} W${ew.week}`;

        if (ew.actualPpr != null) {
          if (!approxEqual(row?.actualPpr, ew.actualPpr, PPR_TOL)) {
            failures.push(
              `${label}: actualPpr expected ${ew.actualPpr}, got ${row?.actualPpr ?? "—"}`,
            );
          }
        }
        if (ew.targets != null) {
          if (row?.targets !== ew.targets) {
            failures.push(
              `${label}: targets expected ${ew.targets}, got ${row?.targets ?? "—"}`,
            );
          }
        }
        if (ew.carries != null) {
          if (row?.carries !== ew.carries) {
            failures.push(
              `${label}: carries expected ${ew.carries}, got ${row?.carries ?? "—"}`,
            );
          }
        }
        if (ew.opponent != null) {
          if (!opponentsMatch(row?.opponent, ew.opponent)) {
            failures.push(
              `${label}: opponent expected ${ew.opponent}, got ${row?.opponent ?? "—"}`,
            );
          }
        }
      }
    }

    if (failures.length) {
      console.error("golden mismatches:");
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `golden assert OK — ${fixture.players.length} players match fixture (Insights/Who-to-Start/Trade inputs)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
