import { buildAuthoritativeRosterMap } from "../src/lib/players/roster-authority";
import { loadSleeperRosterDirectory } from "../src/lib/sleeper/players";
import { loadNflverseWeeklyRoster } from "../src/lib/nflverse/weekly-roster";
import { prisma } from "../src/lib/db";

async function main() {
  const [roster, sleeper, weekly] = await Promise.all([
    buildAuthoritativeRosterMap({ forceRefresh: true }),
    loadSleeperRosterDirectory({ forceRefresh: true }),
    loadNflverseWeeklyRoster({}),
  ]);
  for (const n of ["Aiyuk", "Browning", "Wayne"]) {
    const entries = [...roster.byEspnId.values()].filter((e) =>
      e.name.includes(n),
    );
    for (const e of entries) {
      const sl = e.sleeperId ? sleeper.bySleeperId.get(e.sleeperId) : null;
      const wkSid = e.sleeperId ? weekly.bySleeperId.get(e.sleeperId) : null;
      const wkGsis = e.gsisId ? weekly.byGsisId.get(e.gsisId) : null;
      console.log(
        JSON.stringify(
          {
            name: e.name,
            espnId: e.espnId,
            nflTeam: e.nflTeam,
            pickerEligible: e.pickerEligible,
            excludeReason: e.excludeReason,
            singleSource: e.singleSourceTeam,
            practiceSquad: e.practiceSquad,
            stale: e.staleSleeper,
            evidence: e.evidence,
            sleeper: sl
              ? {
                  team: sl.team,
                  active: sl.active,
                  status: sl.status,
                  news: sl.newsUpdatedMs
                    ? new Date(sl.newsUpdatedMs).toISOString()
                    : null,
                }
              : null,
            weeklyBySid: wkSid
              ? { week: wkSid.week, team: wkSid.team, status: wkSid.status }
              : null,
            weeklyByGsis: wkGsis
              ? { week: wkGsis.week, team: wkGsis.team, status: wkGsis.status }
              : null,
          },
          null,
          2,
        ),
      );
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
