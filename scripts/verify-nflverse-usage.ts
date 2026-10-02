/**
 * Unit guards for nflverse mapper + cron wiring (no DB / no network).
 *
 * Run: npx tsx scripts/verify-nflverse-usage.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildCrosswalk } from "../src/lib/nflverse/crosswalk";
import type { CsvRow } from "../src/lib/nflverse/csv";
import {
  mapWeekStats,
  NFLVERSE_LEAGUE_ID,
  NFLVERSE_SOURCE,
  teamCarryTotals,
} from "../src/lib/nflverse/map-week-stats";
import {
  statsPlayerWeekCsvGzUrl,
  playersCsvUrl,
  FF_PLAYERIDS_CSV_URL,
} from "../src/lib/nflverse/urls";

// ── URLs point at official nflverse / DynastyProcess HTTPS releases ──────────
assert.match(statsPlayerWeekCsvGzUrl(2026), /nflverse-data\/releases\/download\/stats_player/);
assert.match(playersCsvUrl(), /nflverse-data\/releases\/download\/players\/players\.csv/);
assert.match(FF_PLAYERIDS_CSV_URL, /DynastyProcess\/data/);

// ── Crosswalk: never invent ESPN ids ─────────────────────────────────────────
const crosswalk = buildCrosswalk(
  [
    {
      gsis_id: "00-0039040",
      espn_id: "4429160",
      pfr_id: "AchaDe00",
      display_name: "De'Von Achane",
      position: "RB",
      latest_team: "MIA",
    },
    {
      gsis_id: "00-0000001",
      espn_id: "",
      pfr_id: "",
      display_name: "No Espn",
      position: "WR",
      latest_team: "XX",
    },
  ],
  [
    {
      gsis_id: "00-0039040",
      espn_id: "4429160",
      sleeper_id: "9225",
      pfr_id: "AchaDe00",
      name: "De'Von Achane",
      position: "RB",
      team: "MIA",
    },
  ],
);
assert.equal(crosswalk.byGsis.size, 1);
assert.equal(crosswalk.byGsis.get("00-0039040")?.espnId, 4429160);
assert.equal(crosswalk.byGsis.get("00-0039040")?.sleeperId, "9225");
assert.equal(crosswalk.unmappedGsisCount, 1);
assert.equal(crosswalk.byGsis.has("00-0000001"), false);

// ── Mapper: real fields only; rushShare from team totals; RZ stays null ──────
const rows: CsvRow[] = [
  {
    player_id: "00-0039040",
    player_display_name: "De'Von Achane",
    position: "RB",
    season: "2025",
    week: "1",
    season_type: "REG",
    team: "MIA",
    opponent_team: "IND",
    targets: "3",
    receptions: "2",
    carries: "10",
    rushing_yards: "45",
    receiving_yards: "18",
    receiving_air_yards: "12",
    target_share: "0.12",
    passing_air_yards: "999", // must NOT become airYards for skill usage
  },
  {
    player_id: "00-0030000",
    player_display_name: "Other Back",
    position: "RB",
    season: "2025",
    week: "1",
    season_type: "REG",
    team: "MIA",
    opponent_team: "IND",
    targets: "0",
    receptions: "0",
    carries: "5",
    rushing_yards: "20",
    receiving_yards: "0",
    receiving_air_yards: "0",
    target_share: "0",
  },
  {
    player_id: "00-0099999",
    player_display_name: "Postseason Only",
    position: "WR",
    season: "2025",
    week: "1",
    season_type: "POST",
    team: "MIA",
    opponent_team: "BUF",
    targets: "8",
    receptions: "5",
    carries: "0",
    rushing_yards: "0",
    receiving_yards: "70",
    receiving_air_yards: "90",
    target_share: "0.3",
  },
];

const teamCarries = teamCarryTotals(rows.filter((r) => r.season_type === "REG"));
assert.equal(teamCarries.get("MIA|1|REG"), 15);

const mapped = mapWeekStats(rows, 1, {
  pfrIdByGsis: new Map([["00-0039040", "AchaDe00"]]),
  snapRows: [
    {
      week: "1",
      game_type: "REG",
      pfr_player_id: "AchaDe00",
      offense_pct: "0.62",
      player: "De'Von Achane",
    },
  ],
});
assert.equal(mapped.length, 2);
const achane = mapped.find((m) => m.gsisId === "00-0039040");
assert.ok(achane);
assert.equal(achane.targets, 3);
assert.equal(achane.carries, 10);
assert.equal(achane.rushingAttempts, 10);
assert.equal(achane.airYards, 12); // receiving_air_yards, not passing
assert.equal(achane.rushShare, 10 / 15);
assert.equal(achane.snapShare, 0.62);
assert.equal(achane.redZoneTargets, null);
assert.equal(achane.routePct, null);
assert.equal(achane.opponent, "IND");

assert.equal(NFLVERSE_LEAGUE_ID, "");
assert.equal(NFLVERSE_SOURCE, "nflverse");

// ── Cron route + vercel.json wiring ──────────────────────────────────────────
const vercelJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
) as { crons?: { path: string; schedule: string }[] };
assert.ok(Array.isArray(vercelJson.crons));
const usageCron = vercelJson.crons.find(
  (c) => c.path === "/api/cron/nflverse-usage",
);
assert.ok(usageCron, "vercel.json must schedule /api/cron/nflverse-usage");
assert.match(usageCron.schedule, /^\S+ \S+ \S+ \S+ \S+$/);

const cronRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nflverse-usage/route.ts"),
  "utf8",
);
assert.match(cronRoute, /CRON_SECRET/);
assert.match(cronRoute, /Bearer/);
assert.match(cronRoute, /maxDuration/);
assert.match(cronRoute, /ingestNflverseWeek/);

const schema = fs.readFileSync(
  path.join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
assert.match(schema, /gsisId/);
assert.match(schema, /@@unique\(\[gsisId\]\)/);
assert.match(schema, /@@index\(\[sleeperId\]\)/);

const dataSources = fs.readFileSync(
  path.join(process.cwd(), "DATA_SOURCES.md"),
  "utf8",
);
assert.match(dataSources, /nflverse/i);
assert.match(dataSources, /CC-BY/i);

console.log("verify-nflverse-usage: ok");
console.log(
  `  crosswalk=${crosswalk.byGsis.size} mappedWeek=${mapped.length} cron=${usageCron.schedule}`,
);
