/**
 * Manual / ops CLI for the versioned nflverse actuals rebuild (#136).
 *
 * Same path the cron uses (enabled by default after merge). Idempotent;
 * progress stamped in EspnRawResponse. Logs before/after Week 4 coverage,
 * Tetairoa McMillan (CAR) W4 points, and 2-pt conversion event counts.
 *
 * DO NOT run against production from CI or an agent — cron owns prod after
 * merge. Kill-switch: DATA_REBUILD_DISABLED=1.
 *
 * Usage:
 *   npm run rebuild:nflverse-actuals
 *   npm run rebuild:nflverse-actuals -- --season 2026 --through-week 6
 *   npm run rebuild:nflverse-actuals -- --max-weeks 6
 *   DATA_REBUILD_DISABLED=1 npm run rebuild:nflverse-actuals   # no-op
 *
 * Requires DATABASE_URL.
 */

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import {
  detectLatestNflverseWeek,
  resolveNflverseActualsRebuildMode,
  runNflverseActualsRebuild,
  type NflverseActualsRebuildMode,
} from "../src/lib/nflverse";
import { defaultEspnSeason } from "../src/lib/season";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  let mode: NflverseActualsRebuildMode = resolveNflverseActualsRebuildMode();
  if (hasFlag("--disabled") || hasFlag("--off")) mode = "disabled";
  if (hasFlag("--apply")) mode = "apply";

  const season = Number(argValue("--season") ?? defaultEspnSeason());
  if (!Number.isFinite(season) || season < 1999) {
    console.error("Invalid --season");
    process.exit(1);
  }

  let throughWeek = Number(argValue("--through-week") ?? "");
  if (!Number.isFinite(throughWeek) || throughWeek < 1) {
    throughWeek = await detectLatestNflverseWeek(season);
  }

  const maxWeeks = Number(argValue("--max-weeks") ?? "6");
  if (!Number.isFinite(maxWeeks) || maxWeeks < 1) {
    console.error("Invalid --max-weeks");
    process.exit(1);
  }

  console.log(
    `rebuild-nflverse-actuals mode=${mode} season=${season} throughWeek=${throughWeek} maxWeeksPerRun=${maxWeeks}`,
  );

  const result = await runNflverseActualsRebuild({
    season,
    throughWeek,
    mode,
    maxWeeksPerRun: maxWeeks,
  });

  console.log(JSON.stringify(result, null, 2));

  if (mode === "apply" && !result.complete && !result.skipped) {
    console.log(
      "Partial progress — re-run to continue remaining weeks (or wait for cron).",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { prisma } = await import("../src/lib/db");
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });
