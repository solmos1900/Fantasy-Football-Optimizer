/**
 * Manual / ops CLI for the versioned nflverse actuals rebuild (#136).
 *
 * Clears guest-pool espn_category actuals and force-reingests weeks 1..N
 * from nflverse (same path the cron uses when NFLVERSE_ACTUALS_REBUILD_MODE
 * is set). Idempotent; progress is stamped in EspnRawResponse.
 *
 * DO NOT run against production from CI or an agent. Sebastian enables
 * production via Vercel env NFLVERSE_ACTUALS_REBUILD_MODE=apply after review.
 *
 * Usage:
 *   npm run rebuild:nflverse-actuals -- --dry-run
 *   npm run rebuild:nflverse-actuals -- --apply
 *   npm run rebuild:nflverse-actuals -- --apply --season 2026 --through-week 6
 *   npm run rebuild:nflverse-actuals -- --apply --max-weeks 6   # one-shot all weeks
 *
 * Requires DATABASE_URL. Defaults to dry-run when neither --apply nor --dry-run.
 */

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import {
  detectLatestNflverseWeek,
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

  let mode: NflverseActualsRebuildMode = "dry-run";
  if (hasFlag("--apply")) mode = "apply";
  else if (hasFlag("--dry-run") || hasFlag("--off")) {
    mode = hasFlag("--off") ? "off" : "dry-run";
  }

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
      "Partial progress — re-run with --apply to continue remaining weeks.",
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
