/**
 * Guardrails for nflverse usage mapper + cron wiring (no DB required for map tests).
 *
 * Run: npx tsx scripts/verify-nflverse-usage.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  mapNflverseWeekRow,
  mergeNullUsageOnly,
  NFLVERSE_LEAGUE_ID,
  NFLVERSE_SOURCE,
} from "../src/lib/nflverse/map";
import {
  playerWeekStatsCsvGzUrl,
  playersCsvUrl,
} from "../src/lib/nflverse/urls";

// ── Mapper: real-shaped nflverse row ─────────────────────────────────────────
const keenan = mapNflverseWeekRow({
  player_id: "00-0030279",
  player_display_name: "Keenan Allen",
  position: "WR",
  team: "IND",
  season: "2026",
  week: "1",
  season_type: "REG",
  opponent_team: "BAL",
  targets: "6",
  receptions: "5",
  carries: "0",
  rushing_yards: "0",
  receiving_yards: "32",
  target_share: "0.206896551724138",
  receiving_air_yards: "22",
});

assert.ok(keenan);
assert.equal(keenan!.gsisId, "00-0030279");
assert.equal(keenan!.targets, 6);
assert.equal(keenan!.receptions, 5);
assert.equal(keenan!.carries, 0);
assert.equal(keenan!.rushingAttempts, 0);
assert.equal(keenan!.receivingYards, 32);
assert.equal(keenan!.airYards, 22);
assert.ok(keenan!.targetShare != null && keenan!.targetShare > 0.2);
assert.equal(keenan!.snapShare, null); // snaps joined later — never invented

// POST season rows ignored
assert.equal(
  mapNflverseWeekRow({
    player_id: "00-0030279",
    player_display_name: "Keenan Allen",
    position: "WR",
    team: "IND",
    season: "2026",
    week: "1",
    season_type: "POST",
    targets: "6",
    receptions: "5",
    carries: "0",
    rushing_yards: "0",
    receiving_yards: "32",
    target_share: "0.2",
    receiving_air_yards: "22",
  }),
  null,
);

// Week filter
assert.equal(
  mapNflverseWeekRow(
    {
      player_id: "00-0030279",
      player_display_name: "Keenan Allen",
      position: "WR",
      team: "IND",
      season: "2026",
      week: "2",
      season_type: "REG",
      targets: "6",
      receptions: "5",
      carries: "0",
      rushing_yards: "0",
      receiving_yards: "32",
      target_share: "0.2",
      receiving_air_yards: "22",
    },
    { week: 1 },
  ),
  null,
);

// Null-only merge never overwrites existing usage / ignores PPR concerns
const patch = mergeNullUsageOnly(
  {
    targets: 4,
    receptions: null,
    carries: null,
    rushingAttempts: null,
    rushingYards: null,
    receivingYards: null,
    targetShare: null,
    airYards: null,
    snapShare: null,
    opponent: null,
  },
  keenan!,
);
assert.equal(patch.targets, undefined);
assert.equal(patch.receptions, 5);
assert.equal(patch.opponent, "BAL");

assert.equal(NFLVERSE_LEAGUE_ID, "");
assert.equal(NFLVERSE_SOURCE, "nflverse");

// Official HTTPS release URLs
assert.match(playersCsvUrl(), /^https:\/\/github\.com\/nflverse\/nflverse-data\//);
assert.match(
  playerWeekStatsCsvGzUrl(2026),
  /stats_player\/stats_player_week_2026\.csv\.gz$/,
);

// Cron + vercel wiring
const vercelJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
) as { crons?: { path: string; schedule: string }[] };
const nflCron = vercelJson.crons?.find((c) => c.path === "/api/cron/nflverse-usage");
assert.ok(nflCron, "vercel.json must schedule /api/cron/nflverse-usage");
assert.match(nflCron.schedule, /^\S+ \S+ \S+ \S+ \S+$/);

const cronRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nflverse-usage/route.ts"),
  "utf8",
);
assert.match(cronRoute, /CRON_SECRET/);
assert.match(cronRoute, /Bearer/);
assert.match(cronRoute, /ingestNflverseUsage/);

const schema = fs.readFileSync(
  path.join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
assert.match(schema, /gsisId/);
assert.match(schema, /@@index\(\[gsisId\]\)/);
assert.match(schema, /@@index\(\[sleeperId\]\)/);

const dataSources = fs.readFileSync(
  path.join(process.cwd(), "docs/DATA_SOURCES.md"),
  "utf8",
);
assert.match(dataSources, /CC BY 4\.0/);
assert.match(dataSources, /nflverse/);

console.log("verify-nflverse-usage: ok");
console.log(
  `  mapped Keenan Allen W1 targets=${keenan!.targets} share=${keenan!.targetShare?.toFixed(3)} cron=${nflCron.schedule}`,
);
