/**
 * Backfill / one-shot nflverse usage ingest into PlayerWeekStat (leagueId="").
 *
 * Usage:
 *   npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --week 3
 *   npx tsx scripts/ingest-nflverse-usage.ts --season 2026 --from-week 1 --to-week 4
 *   npx tsx scripts/ingest-nflverse-usage.ts --season 2026            # latest week only
 *
 * Requires DATABASE_URL. Attribution: nflverse open data (CC-BY) — see DATA_SOURCES.md
 */
import "dotenv/config";
import {
  ingestNflverseWeek,
  latestCompletedWeek,
  loadPlayerCrosswalk,
} from "../src/lib/nflverse";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function requireInt(raw: string | undefined, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new Error(`Missing/invalid ${label}`);
  }
  return n;
}

async function main() {
  const season = requireInt(
    argValue("--season") ?? process.env.DEFAULT_ESPN_SEASON ?? "2026",
    "--season",
  );
  const weekArg = argValue("--week");
  const fromArg = argValue("--from-week");
  const toArg = argValue("--to-week");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  console.log(`[ingest-nflverse-usage] loading crosswalk (season=${season})…`);
  const crosswalk = await loadPlayerCrosswalk();
  console.log(
    `[ingest-nflverse-usage] crosswalk size=${crosswalk.byGsis.size} unmappedGsis=${crosswalk.unmappedGsisCount}`,
  );

  let weeks: number[];
  if (weekArg != null) {
    weeks = [requireInt(weekArg, "--week")];
  } else if (fromArg != null || toArg != null) {
    const from = requireInt(fromArg, "--from-week");
    const to = requireInt(toArg, "--to-week");
    if (to < from) throw new Error("--to-week must be >= --from-week");
    weeks = [];
    for (let w = from; w <= to; w += 1) weeks.push(w);
  } else {
    const latest = await latestCompletedWeek(season);
    if (latest == null) {
      console.log("[ingest-nflverse-usage] no REG weeks in file; nothing to do");
      return;
    }
    weeks = [latest];
  }

  for (const week of weeks) {
    console.log(`[ingest-nflverse-usage] season=${season} week=${week}…`);
    const result = await ingestNflverseWeek({ season, week, crosswalk });
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
