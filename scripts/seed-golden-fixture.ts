/**
 * Seed Player + PlayerWeekStat rows from the golden fixture so CI can assert
 * without a full nflverse ingest. Idempotent upserts (leagueId="").
 */
import { PrismaClient } from "@prisma/client";
import { loadGoldenFixture } from "../src/lib/accuracy/golden-check";
import { NFLVERSE_LEAGUE_ID, NFLVERSE_SOURCE } from "../src/lib/nflverse/map";

const prisma = new PrismaClient();

async function main() {
  const fixture = loadGoldenFixture();
  let players = 0;
  let weeks = 0;

  for (const fp of fixture.players) {
    const team = fp.expected.nflTeam ?? "FA";
    await prisma.player.upsert({
      where: { espnId: fp.espnId },
      create: {
        espnId: fp.espnId,
        espnPlayerId: String(fp.espnId),
        name: fp.name,
        position: "RB",
        nflTeam: team,
      },
      update: {
        name: fp.name,
        nflTeam: team,
      },
    });
    players += 1;

    const dbPlayer = await prisma.player.findUniqueOrThrow({
      where: { espnId: fp.espnId },
    });

    for (const w of fp.expected.weeks) {
      // Skip unknown weeks (all-null) — no row to seed
      if (
        w.actualPpr == null &&
        w.targets == null &&
        w.carries == null &&
        w.opponent == null
      ) {
        continue;
      }
      await prisma.playerWeekStat.upsert({
        where: {
          espnId_season_week_leagueId: {
            espnId: fp.espnId,
            season: fixture.season,
            week: w.week,
            leagueId: NFLVERSE_LEAGUE_ID,
          },
        },
        create: {
          playerId: dbPlayer.id,
          espnId: fp.espnId,
          playerName: fp.name,
          position: dbPlayer.position,
          nflTeam: team,
          season: fixture.season,
          week: w.week,
          scoringFormat: "PPR",
          actualPpr: w.actualPpr,
          actualSource: w.actualPpr != null ? "nflverse_ppr" : null,
          targets: w.targets,
          carries: w.carries,
          opponent: w.opponent,
          source: NFLVERSE_SOURCE,
          leagueId: NFLVERSE_LEAGUE_ID,
        },
        update: {
          actualPpr: w.actualPpr,
          actualSource: w.actualPpr != null ? "nflverse_ppr" : null,
          targets: w.targets,
          carries: w.carries,
          opponent: w.opponent,
          source: NFLVERSE_SOURCE,
        },
      });
      weeks += 1;
    }
  }

  console.log(JSON.stringify({ players, weeks, season: fixture.season }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
