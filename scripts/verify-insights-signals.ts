/**
 * Spot-check Insights signal numbers against PlayerWeekStat (nflverse) for 5 players.
 * Run: npx tsx scripts/verify-insights-signals.ts
 */
import { PrismaClient } from "@prisma/client";
import { buildDefenseVsPositionMap } from "../src/lib/insights/defense-vs-position";
import { fetchSleeperProjections } from "../src/lib/sleeper/projections";
import { fetchNflWeekSnapshot } from "../src/lib/players/week";
import { defaultEspnSeason } from "../src/lib/season";

const prisma = new PrismaClient();

const SPOT = [
  "Bijan Robinson",
  "CeeDee Lamb",
  "Jaxon Smith-Njigba",
  "Puka Nacua",
  "Drake London",
];

async function main() {
  const season = defaultEspnSeason();
  const snap = await fetchNflWeekSnapshot(season);
  const through = snap.latestCompletedWeek;
  console.log(
    JSON.stringify(
      {
        season,
        currentWeek: snap.currentWeek,
        statsThroughWeek: through,
      },
      null,
      2,
    ),
  );

  const sleeper = await fetchSleeperProjections({
    season,
    week: snap.currentWeek,
  });
  console.log("sleeper.emptyFeed", sleeper.emptyFeed, "n", sleeper.byEspnId.size);

  const dvp = await buildDefenseVsPositionMap({
    season,
    throughWeek: through,
    lookback: 4,
  });
  console.log("dvp keys", dvp.size);

  const table: Record<string, unknown>[] = [];

  for (const name of SPOT) {
    const player = await prisma.player.findFirst({
      where: { name: { contains: name.split(" ").pop()!, mode: "insensitive" } },
    });
    // Prefer exact-ish match
    const exact =
      (await prisma.player.findFirst({ where: { name } })) ?? player;
    if (!exact) {
      table.push({ name, error: "player not in DB" });
      continue;
    }

    const weeks = await prisma.playerWeekStat.findMany({
      where: {
        espnId: exact.espnId,
        season,
        leagueId: "",
        week: { lte: through },
      },
      orderBy: { week: "asc" },
    });

    const played = weeks
      .filter((w) => w.actualPpr != null)
      .map((w) => w.actualPpr as number);
    const last3 = played.slice(-3);
    const avg3 =
      last3.length > 0
        ? last3.reduce((a, b) => a + b, 0) / last3.length
        : null;
    const seasonAvg =
      played.length > 0
        ? played.reduce((a, b) => a + b, 0) / played.length
        : null;
    const tgt = weeks.filter((w) => w.targetShare != null);
    const tgt3 = tgt.slice(-3);
    const tgtAvg3 =
      tgt3.length > 0
        ? tgt3.reduce((a, b) => a + (b.targetShare as number), 0) / tgt3.length
        : null;
    const tgtSzn =
      tgt.length > 0
        ? tgt.reduce((a, b) => a + (b.targetShare as number), 0) / tgt.length
        : null;

    const lastOpp = weeks[weeks.length - 1]?.opponent ?? null;
    const pos = exact.position;
    const chip =
      lastOpp && pos
        ? dvp.get(`${lastOpp}|${pos}`)
        : null;

    table.push({
      name: exact.name,
      espnId: exact.espnId,
      position: exact.position,
      nflTeam: exact.nflTeam,
      source: "PlayerWeekStat leagueId=\"\" nflverse",
      weeks: weeks.map((w) => ({
        week: w.week,
        actualPpr: w.actualPpr,
        targetShare: w.targetShare,
        snapShare: w.snapShare,
        opponent: w.opponent,
      })),
      avg3: avg3 != null ? Math.round(avg3 * 10) / 10 : null,
      seasonAvg: seasonAvg != null ? Math.round(seasonAvg * 10) / 10 : null,
      tgtShare3: tgtAvg3,
      tgtShareSzn: tgtSzn,
      sleeperProj: sleeper.byEspnId.get(exact.espnId) ?? null,
      lastOpp,
      dvp: chip
        ? { label: chip.label, rank: chip.rank, avgAllowed: chip.avgAllowed }
        : null,
    });
  }

  console.log("--- spot-check table ---");
  console.log(JSON.stringify(table, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
