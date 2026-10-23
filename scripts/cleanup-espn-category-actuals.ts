/**
 * One-off cleanup: clear guest-pool actuals that came from ESPN public
 * (`actualSource=espn_category` on leagueId="").
 *
 * Why: ESPN kona_player_info mixes prior-season weeks into the current season
 * feed without a usable season filter in our mapper (#125). Those rows were
 * persisted as 2026 actuals. nflverse is the ONLY source of actual fantasy
 * points for the no-league pool — wipe ESPN category actuals so backfill can
 * repopulate from nflverse.
 *
 * Idempotent: re-running after a clean DB is a no-op (0 rows updated).
 *
 * DO NOT run against production from CI or an agent. Run manually against a
 * local / staging DATABASE_URL after review:
 *
 *   DATABASE_URL="postgresql://…" npx tsx scripts/cleanup-espn-category-actuals.ts
 *   DATABASE_URL="postgresql://…" npx tsx scripts/cleanup-espn-category-actuals.ts --dry-run
 *
 * Requires DATABASE_URL. Does not touch league-scoped ESPN sync rows.
 */

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { PrismaClient } from "@prisma/client";
import { NFLVERSE_LEAGUE_ID } from "../src/lib/nflverse/map";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const where = {
    leagueId: NFLVERSE_LEAGUE_ID,
    actualSource: "espn_category",
  } as const;

  const count = await prisma.playerWeekStat.count({ where });
  console.log(
    `Found ${count} PlayerWeekStat row(s) with actualSource=espn_category (leagueId="").`,
  );

  if (dryRun) {
    console.log("Dry run — no updates.");
    return;
  }

  if (count === 0) {
    console.log("Nothing to clean.");
    return;
  }

  const result = await prisma.playerWeekStat.updateMany({
    where,
    data: {
      actualPpr: null,
      actualSource: null,
    },
  });

  console.log(
    `Cleared actualPpr/actualSource on ${result.count} row(s). Re-run nflverse backfill (cron or pool refresh) to refill from nflverse_ppr.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
