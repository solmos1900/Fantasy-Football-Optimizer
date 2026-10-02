/**
 * Backfill / one-shot nflverse usage ingest into Neon (Player + PlayerWeekStat).
 *
 * Usage:
 *   npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --week 4
 *   npx tsx scripts/ingest-nflverse-usage.ts --season 2024            # all REG weeks
 *   npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --latest   # latest REG week only
 *
 * Requires DATABASE_URL. Fetches official nflverse-data release CSVs over HTTPS.
 * Attribution: nflverse CC BY 4.0 — see docs/DATA_SOURCES.md
 */

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import {
  detectLatestNflverseWeek,
  ingestNflverseUsage,
} from "../src/lib/nflverse";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const seasonRaw = argValue("--season");
  if (!seasonRaw) {
    console.error(
      "Usage: npx tsx scripts/ingest-nflverse-usage.ts --season YYYY [--week N | --latest]",
    );
    process.exit(1);
  }
  const season = Number(seasonRaw);
  if (!Number.isFinite(season)) {
    console.error("Invalid --season");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  let week: number | undefined;
  if (hasFlag("--latest")) {
    week = await detectLatestNflverseWeek(season);
    console.log(`Using latest REG week ${week} for season ${season}`);
  } else if (argValue("--week")) {
    week = Number(argValue("--week"));
    if (!Number.isFinite(week) || week! < 1) {
      console.error("Invalid --week");
      process.exit(1);
    }
  }

  console.log(
    `Ingesting nflverse usage season=${season} week=${week ?? "ALL"} …`,
  );

  if (week != null) {
    const result = await ingestNflverseUsage({
      season,
      week,
      includeSnaps: true,
      mergeIntoLeagueRows: true,
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    const latest = await detectLatestNflverseWeek(season);
    const weeks: object[] = [];
    for (let w = 1; w <= latest; w++) {
      console.log(`  week ${w}/${latest}`);
      const result = await ingestNflverseUsage({
        season,
        week: w,
        includeSnaps: true,
        mergeIntoLeagueRows: true,
      });
      weeks.push(result);
    }
    console.log(JSON.stringify({ season, weeksProcessed: latest, weeks }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
