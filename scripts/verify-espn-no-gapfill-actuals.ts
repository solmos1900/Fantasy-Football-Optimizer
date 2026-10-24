/**
 * Regression (#147): no ESPN path may write guest-pool actual fantasy points.
 * - Cron must not call fillEspnGamelogGaps / must not import fill-espn-gaps
 * - fill-espn-gaps.ts must stay deleted
 * - No writer may set actualSource=espn_category (cleanup only clears it)
 * - One-time cleanup is wired, honors DATA_REBUILD_DISABLED, logs before/after
 *
 * Run: npm run verify:espn-no-gapfill-actuals
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DATA_REBUILD_DISABLED_ENV,
  clearEspnCategoryActuals,
  countEspnCategoryActuals,
  resolveNflverseActualsRebuildMode,
} from "../src/lib/nflverse/actuals-rebuild";
import {
  ESPN_CATEGORY_CLEANUP_VERSION,
  ESPN_CATEGORY_CLEANUP_VIEW,
  runEspnCategoryActualsCleanup,
} from "../src/lib/nflverse/espn-category-cleanup";
import { NFLVERSE_LEAGUE_ID } from "../src/lib/nflverse/map";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// ── Gap-fill module must stay gone ───────────────────────────────────────────
assert.equal(
  fs.existsSync(path.join(root, "src/lib/players/fill-espn-gaps.ts")),
  false,
  "fill-espn-gaps.ts must remain deleted — it wrote ESPN actualPpr",
);

// ── Cron: cleanup yes, gap-fill no ───────────────────────────────────────────
const cronSrc = read("src/app/api/cron/nflverse-usage/route.ts");
assert.doesNotMatch(
  cronSrc,
  /fillEspnGamelogGaps|fill-espn-gaps/,
  "cron must not import or call ESPN gap-fill",
);
assert.match(
  cronSrc,
  /runEspnCategoryActualsCleanup/,
  "cron must run the one-time espn_category cleanup (#147)",
);
assert.doesNotMatch(
  cronSrc,
  /espnGaps/,
  "cron response must not report espnGaps fills",
);

// ── No writer may set actualSource to espn_category ──────────────────────────
const writerRoots = [
  "src/lib",
  "src/app",
  "scripts",
].flatMap((dir) => {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx")) out.push(p);
    }
  };
  walk(abs);
  return out;
});

const assignEspnCategory = /actualSource\s*:\s*["']espn_category["']/;
const offenders: string[] = [];
for (const file of writerRoots) {
  const src = fs.readFileSync(file, "utf8");
  if (!assignEspnCategory.test(src)) continue;
  // Allowed: clear/count filters, loader ignores, docs/comments in verify scripts.
  const rel = path.relative(root, file);
  const allowed =
    rel === "src/lib/nflverse/actuals-rebuild.ts" ||
    rel === "src/lib/players/pool.ts" ||
    rel === "scripts/cleanup-espn-category-actuals.ts" ||
    rel.startsWith("scripts/verify-");
  if (!allowed) offenders.push(rel);
  // actuals-rebuild may filter on espn_category but must not *set* it in data:{}
  if (rel === "src/lib/nflverse/actuals-rebuild.ts") {
    assert.doesNotMatch(
      src,
      /data:\s*\{[^}]*actualSource:\s*["']espn_category["']/,
      "rebuild must clear espn_category, never write it",
    );
  }
}
assert.deepEqual(
  offenders,
  [],
  `no module may write actualSource=espn_category; offenders=${offenders.join(",")}`,
);

// Cleanup module: clears only, never assigns espn_category as a write value
const cleanupSrc = read("src/lib/nflverse/espn-category-cleanup.ts");
assert.match(cleanupSrc, /DATA_REBUILD_DISABLED/);
assert.match(cleanupSrc, /clearEspnCategoryActuals/);
assert.match(cleanupSrc, /before/);
assert.match(cleanupSrc, /after/);
assert.match(cleanupSrc, /ESPN_CATEGORY_CLEANUP_VERSION/);
assert.equal(ESPN_CATEGORY_CLEANUP_VERSION, 1);
assert.equal(ESPN_CATEGORY_CLEANUP_VIEW, "espn_category_actuals_cleanup");
assert.doesNotMatch(
  cleanupSrc,
  /actualSource\s*:\s*["']espn_category["']/,
  "cleanup module must not re-tag rows as espn_category",
);

// clearEspnCategoryActuals only nulls espn_category rows (source guard)
const rebuildSrc = read("src/lib/nflverse/actuals-rebuild.ts");
assert.match(
  rebuildSrc,
  /async function clearEspnCategoryActuals|export async function clearEspnCategoryActuals/,
);
assert.match(
  rebuildSrc,
  /actualSource:\s*["']espn_category["'][\s\S]*?actualPpr:\s*null[\s\S]*?actualSource:\s*null/,
  "clear must null actualPpr + actualSource for espn_category only",
);
assert.match(rebuildSrc, /leagueId:\s*NFLVERSE_LEAGUE_ID/);

// Kill-switch shared with #141
assert.equal(
  resolveNflverseActualsRebuildMode({ [DATA_REBUILD_DISABLED_ENV]: "1" }),
  "disabled",
);
assert.equal(resolveNflverseActualsRebuildMode({}), "apply");

// ESPN public path still forbids actuals
const publicSrc = read("src/lib/players/espn-public.ts");
assert.match(publicSrc, /Never emit ESPN actuals|actualPoints:\s*null/);

// Accuracy rule documents nflverse-only
const rules = read("docs/ACCURACY_RULES.md");
assert.match(rules, /nflverse only/i);
assert.doesNotMatch(
  rules,
  /fill PPR from ESPN gamelog/,
  "accuracy rules must not instruct ESPN gamelog gap-fill",
);

assert.equal(NFLVERSE_LEAGUE_ID, "");

console.log("verify-espn-no-gapfill-actuals: source guards ok");

async function liveCleanupChecks() {
  if (!process.env.DATABASE_URL) {
    console.log(
      "verify-espn-no-gapfill-actuals: skip live cleanup (no DATABASE_URL)",
    );
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const season = 2099; // isolated test season — never production data
  const espnId = 9_000_147;
  let playerId: string | null = null;

  try {
    const player = await prisma.player.upsert({
      where: { espnId },
      create: {
        espnId,
        name: "Cleanup Probe #147",
        position: "WR",
        nflTeam: "NE",
      },
      update: { name: "Cleanup Probe #147" },
    });
    playerId = player.id;

    // Seed one espn_category row and one nflverse_ppr row.
    await prisma.playerWeekStat.deleteMany({
      where: { espnId, season, leagueId: NFLVERSE_LEAGUE_ID },
    });
    await prisma.playerWeekStat.createMany({
      data: [
        {
          playerId: player.id,
          espnId,
          playerName: player.name,
          position: "WR",
          nflTeam: "NE",
          season,
          week: 1,
          scoringFormat: "PPR",
          actualPpr: 12.3,
          actualSource: "espn_category",
          source: "espn",
          leagueId: NFLVERSE_LEAGUE_ID,
        },
        {
          playerId: player.id,
          espnId,
          playerName: player.name,
          position: "WR",
          nflTeam: "NE",
          season,
          week: 2,
          scoringFormat: "PPR",
          actualPpr: 18.4,
          actualSource: "nflverse_ppr",
          source: "nflverse",
          leagueId: NFLVERSE_LEAGUE_ID,
        },
      ],
    });

    const before = await countEspnCategoryActuals({ season });
    assert.equal(before, 1, "seeded one espn_category row");

    // Kill-switch must no-op
    const disabled = await runEspnCategoryActualsCleanup({
      season,
      mode: "disabled",
      targetVersion: 99_147,
    });
    assert.equal(disabled.skipped, true);
    assert.equal(disabled.skipReason, "data_rebuild_disabled");
    assert.equal(
      await countEspnCategoryActuals({ season }),
      1,
      "kill-switch must not clear",
    );

    const applied = await runEspnCategoryActualsCleanup({
      season,
      mode: "apply",
      targetVersion: 99_147,
    });
    assert.equal(applied.skipped, false);
    assert.equal(applied.beforeCount, 1);
    assert.equal(applied.cleared, 1);
    assert.equal(applied.afterCount, 0);
    assert.equal(applied.complete, true);

    const espnRow = await prisma.playerWeekStat.findFirst({
      where: { espnId, season, week: 1, leagueId: NFLVERSE_LEAGUE_ID },
    });
    assert.ok(espnRow);
    assert.equal(espnRow!.actualPpr, null, "espn_category actual cleared");
    assert.equal(espnRow!.actualSource, null);

    const nflverseRow = await prisma.playerWeekStat.findFirst({
      where: { espnId, season, week: 2, leagueId: NFLVERSE_LEAGUE_ID },
    });
    assert.ok(nflverseRow);
    assert.equal(nflverseRow!.actualPpr, 18.4, "nflverse row must be untouched");
    assert.equal(nflverseRow!.actualSource, "nflverse_ppr");

    // Idempotent: already at version → skip, counts stay 0
    const again = await runEspnCategoryActualsCleanup({
      season,
      mode: "apply",
      targetVersion: 99_147,
    });
    assert.equal(again.skipped, true);
    assert.equal(again.skipReason, "already_at_version");
    assert.equal(again.cleared, 0);

    // Direct clear helper is also idempotent on empty set
    assert.equal(await clearEspnCategoryActuals({ season }), 0);

    console.log("verify-espn-no-gapfill-actuals: live cleanup ok");
  } finally {
    if (playerId) {
      await prisma.playerWeekStat.deleteMany({
        where: { espnId, season, leagueId: NFLVERSE_LEAGUE_ID },
      });
      await prisma.espnRawResponse.deleteMany({
        where: {
          espnLeagueId: "__nflverse_rebuild__",
          season,
          view: ESPN_CATEGORY_CLEANUP_VIEW,
          week: 0,
        },
      });
      await prisma.player.deleteMany({ where: { espnId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

liveCleanupChecks()
  .then(() => {
    console.log("verify-espn-no-gapfill-actuals: ok");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
