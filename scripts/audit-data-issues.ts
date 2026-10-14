import { prisma } from "../src/lib/db";
import { buildAuthoritativeRosterMap } from "../src/lib/players/roster-authority";
import { getNoLeaguePlayerPool } from "../src/lib/players/pool";
import {
  fetchSleeperProjections,
  sleeperProjForPlayer,
} from "../src/lib/sleeper/projections";

async function main() {
  const open = await prisma.dataIssue.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "desc" },
  });
  const byKind: Record<string, number> = {};
  for (const r of open) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  console.log("OPEN_TOTAL", open.length, "byKind", byKind);

  const [roster, pool] = await Promise.all([
    buildAuthoritativeRosterMap({ forceRefresh: true }),
    getNoLeaguePlayerPool({ forceRefresh: true }),
  ]);
  const poolEspn = new Set(pool.players.map((p) => p.espnId));
  const auth = roster.byEspnId;

  let inPool = 0;
  let stale = 0;
  let excluded = 0;
  let noAuth = 0;
  const samples: Record<string, string[]> = {};
  for (const r of open) {
    const espn = r.espnId;
    const a = espn != null ? auth.get(espn) : undefined;
    const inP = espn != null && poolEspn.has(espn);
    let bucket = "OTHER";
    if (inP) {
      inPool += 1;
      bucket = "IN_POOL";
    } else if (a?.staleSleeper) {
      stale += 1;
      bucket = "STALE";
    } else if (a && !a.pickerEligible) {
      excluded += 1;
      bucket = "EXCLUDED";
    } else if (!a) {
      noAuth += 1;
      bucket = "NO_AUTH";
    } else {
      excluded += 1;
      bucket = "EXCLUDED_ELIG?";
    }
    (samples[bucket] ??= []).push(
      `${r.kind}:${r.playerName ?? espn} | ${r.detail?.slice(0, 90)}`,
    );
  }
  console.log({ inPool, stale, excluded, noAuth });
  for (const [k, v] of Object.entries(samples)) {
    console.log("\n##", k, v.length);
    for (const line of v.slice(0, 10)) console.log(" ", line);
  }

  const browning = pool.players.find((p) => p.name.includes("Jake Browning"));
  const projMap = await fetchSleeperProjections({
    season: pool.freshness.season,
    week: pool.freshness.currentWeek,
  });
  const sp = browning ? sleeperProjForPlayer(projMap, browning) : null;
  console.log("\nBROWNING", {
    inPool: Boolean(browning),
    espn: browning?.espnId,
    poolProj: browning?.projectedPoints,
    sleeperProj: sp,
    sleeperHasEspn: browning
      ? projMap.byEspnId.has(browning.espnId)
      : false,
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
