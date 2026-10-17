/**
 * Live no-league pool data-quality gate.
 *
 * Asserts:
 * - Justin Jefferson (espn 4262921) = MIN
 * - Bijan Robinson (espn 4430807) = ATL with Sleeper projection > 0
 * - No retired/inactive players in the picker pool
 * - FA count reasonable; every FA genuinely unrostered per Sleeper
 *
 * Run: npm run verify:pool
 */

import assert from "node:assert/strict";
import { getNoLeaguePlayerPool } from "../src/lib/players/pool";
import { buildAuthoritativeRosterMap } from "../src/lib/players/roster-authority";
import { loadSleeperRosterDirectory } from "../src/lib/sleeper/players";
import {
  fetchSleeperProjections,
  sleeperProjForPlayer,
} from "../src/lib/sleeper/projections";
import { runPoolDataValidation } from "../src/lib/accuracy/data-issues";
import { prisma } from "../src/lib/db";

const JEFFERSON_ESPN = 4262921;
const BIJAN_ESPN = 4430807;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("verify:pool requires DATABASE_URL");
  }

  console.log("verify:pool — loading authoritative roster + pool…");

  const beforeFa = await prisma.player.count({
    where: {
      position: { in: ["QB", "RB", "WR", "TE"] },
      OR: [{ nflTeam: null }, { nflTeam: "FA" }, { nflTeam: "" }],
    },
  });

  const validation = await runPoolDataValidation();
  console.log("pool validation", validation);

  const [roster, sleeperDir, pool] = await Promise.all([
    buildAuthoritativeRosterMap({ forceRefresh: true }),
    loadSleeperRosterDirectory({ forceRefresh: true }),
    getNoLeaguePlayerPool({ forceRefresh: true }),
  ]);
  const sleeperProj = await fetchSleeperProjections({
    season: pool.freshness.season,
    week: pool.freshness.currentWeek,
  });

  const afterFaDb = await prisma.player.count({
    where: {
      position: { in: ["QB", "RB", "WR", "TE"] },
      OR: [{ nflTeam: null }, { nflTeam: "FA" }, { nflTeam: "" }],
    },
  });

  const jefferson = pool.players.find((p) => p.espnId === JEFFERSON_ESPN);
  const bijan = pool.players.find((p) => p.espnId === BIJAN_ESPN);

  assert.ok(jefferson, "Justin Jefferson missing from pool");
  assert.equal(
    (jefferson!.nflTeam ?? "").toUpperCase(),
    "MIN",
    `Justin Jefferson team: expected MIN, got ${jefferson!.nflTeam}`,
  );

  assert.ok(bijan, "Bijan Robinson missing from pool");
  assert.equal(
    (bijan!.nflTeam ?? "").toUpperCase(),
    "ATL",
    `Bijan Robinson team: expected ATL, got ${bijan!.nflTeam}`,
  );

  const bijanSleeper = sleeperProjForPlayer(sleeperProj, bijan!);
  assert.ok(
    bijanSleeper != null && bijanSleeper > 0,
    `Bijan Robinson Sleeper proj must be > 0, got ${bijanSleeper}`,
  );
  assert.ok(
    bijan!.projectedPoints != null && bijan!.projectedPoints > 0,
    `Bijan pool projectedPoints must be > 0 (Sleeper overlay), got ${bijan!.projectedPoints}`,
  );
  // Pool proj must match Sleeper for the same week — never a leftover ESPN value.
  assert.equal(
    bijan!.projectedPoints,
    bijanSleeper,
    `Bijan pool proj ${bijan!.projectedPoints} != Sleeper ${bijanSleeper} (ESPN leak?)`,
  );

  // No retired / inactive in picker pool (Reserve/Left Squad may appear as
  // display-only / unselectable — never pickerEligible).
  const AIYUK_ESPN = 4360438;
  const aiyuk = pool.players.find((p) => p.espnId === AIYUK_ESPN);
  assert.ok(aiyuk, "Brandon Aiyuk should remain visible (SF Reserve/Left Squad)");
  assert.equal((aiyuk!.nflTeam ?? "").toUpperCase(), "SF");
  assert.equal(aiyuk!.reserveLeftSquad, true);
  assert.equal(aiyuk!.practiceSquad, false);
  const aiyukAuth = roster.byEspnId.get(AIYUK_ESPN);
  assert.equal(aiyukAuth?.pickerEligible, false);
  assert.equal(aiyukAuth?.reserveLeftSquad, true);

  for (const p of pool.players) {
    const auth = roster.byEspnId.get(p.espnId);
    if (p.reserveLeftSquad || auth?.reserveLeftSquad) {
      assert.equal(
        auth?.pickerEligible,
        false,
        `${p.name} Reserve/Left Squad must not be picker-eligible`,
      );
      continue;
    }
    assert.ok(
      auth?.pickerEligible !== false,
      `${p.name} (${p.espnId}) in pool but not picker-eligible: ${auth?.excludeReason}`,
    );
    const team = (p.nflTeam ?? "").toUpperCase();
    assert.ok(
      team && team !== "FA",
      `${p.name} in pool with FA/empty team`,
    );
  }

  // Wayne + Browning remain selectable single-source (not Reserve/Left Squad)
  const wayne = pool.players.find((p) => p.name.includes("Jared Wayne"));
  const browning = pool.players.find((p) => p.name.includes("Jake Browning"));
  assert.ok(wayne && !wayne.reserveLeftSquad, "Jared Wayne should stay selectable");
  assert.ok(
    browning && !browning.reserveLeftSquad && browning.practiceSquad,
    "Jake Browning should stay practice-squad / selectable",
  );

  // FA count in pool should be 0 after filter; DB FAs must be unrostered on Sleeper
  const poolFa = pool.players.filter(
    (p) => !p.nflTeam || p.nflTeam.toUpperCase() === "FA",
  );
  assert.equal(
    poolFa.length,
    0,
    `Pool still has ${poolFa.length} FA rows (should be excluded)`,
  );

  // Every remaining DB FA must be genuinely unrostered: not picker-eligible
  // on the Sleeper+nflverse authority map (avoids stale Sleeper practice-squad noise).
  const dbFas = await prisma.player.findMany({
    where: {
      position: { in: ["QB", "RB", "WR", "TE"] },
      OR: [{ nflTeam: null }, { nflTeam: "FA" }, { nflTeam: "" }],
    },
    take: 800,
    select: { espnId: true, name: true, nflTeam: true },
  });

  let falseFa = 0;
  for (const fa of dbFas) {
    const auth = roster.byEspnId.get(fa.espnId);
    if (auth?.pickerEligible && auth.nflTeam !== "FA") {
      falseFa += 1;
      console.error(
        `  false FA: ${fa.name} (${fa.espnId}) DB=${fa.nflTeam} auth=${auth.nflTeam} sleeper=${auth.sleeperTeam} nflverse=${auth.nflverseTeam}`,
      );
    }
  }
  assert.equal(
    falseFa,
    0,
    `${falseFa} DB FA players are still rostered per Sleeper+nflverse authority`,
  );
  // Keep sleeperDir referenced for audit
  void sleeperDir;

  // Reasonable FA count in DB after correction (skill positions)
  assert.ok(
    afterFaDb < 2500,
    `DB FA count still very high: ${afterFaDb} (before ${beforeFa})`,
  );

  const audit = {
    beforeFaDb: beforeFa,
    afterFaDb,
    poolSize: pool.players.length,
    poolFa: poolFa.length,
    jeffersonTeam: jefferson!.nflTeam,
    bijanTeam: bijan!.nflTeam,
    bijanSleeperProj: bijanSleeper,
    bijanPoolProj: bijan!.projectedPoints,
    sleeperActiveWithTeam: roster.sleeperSkillActiveWithTeam,
    validation,
    dataIssueNotices: pool.freshness.dataIssueNotices ?? [],
    dataIssueCount: pool.freshness.dataIssueCount ?? 0,
  };

  console.log(JSON.stringify(audit, null, 2));
  console.log("verify-pool: ok");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
