import { PrismaClient } from "@prisma/client";
import { fetchEspnInjuryReport } from "../src/lib/espn/injuries";
import { buildTeammateInjuryIndex } from "../src/lib/insights/teammate-injury";
import type { InjuryStatus, PlayerPosition } from "../src/lib/types";

const prisma = new PrismaClient();

async function main() {
  const report = await fetchEspnInjuryReport();
  const skill = report.filter(
    (r) => r.position && ["RB", "WR", "TE", "QB"].includes(r.position),
  );
  console.log("espn injury skill", skill.length);
  console.log(
    skill
      .filter((s) => ["OUT", "IR", "DOUBTFUL"].includes(s.status))
      .slice(0, 25),
  );

  const dbPlayers = await prisma.player.findMany({
    where: {
      nflTeam: { in: ["CLE", "BUF", "DAL", "IND", "BAL", "SF"] },
      position: { in: ["RB", "WR", "TE", "QB"] },
    },
  });

  const pool = dbPlayers.map((p) => {
    const hit = report.find(
      (r) =>
        r.espnAthleteId === p.espnId ||
        (r.name === p.name && r.nflTeam === p.nflTeam),
    );
    return {
      espnId: p.espnId,
      name: p.name,
      position: p.position as PlayerPosition,
      nflTeam: p.nflTeam ?? "FA",
      injuryStatus: (hit?.status ?? "ACTIVE") as InjuryStatus,
      projectedPoints: 10,
    };
  });

  const index = await buildTeammateInjuryIndex({
    season: 2026,
    statsThroughWeek: 5,
    players: pool,
  });

  console.log("--- impacts ---");
  for (const [id, impacts] of index.byEspnId) {
    if (!impacts.length) continue;
    const p = pool.find((x) => x.espnId === id);
    console.log(
      p?.name,
      p?.nflTeam,
      impacts.map((i) => ({
        label: i.label,
        detail: i.detail,
        delta: i.chipDelta,
        share: i.share3wk,
      })),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
