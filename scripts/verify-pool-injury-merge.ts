/**
 * Regression: guest pool injury status = more serious of ESPN report + Sleeper
 * (#128). David Montgomery (Doubtful) must not stay ACTIVE when either source
 * says Doubtful/Out/IR.
 *
 * Run: npm run verify:pool-injury-merge
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyInjuryReport,
  applySleeperInjuryStatuses,
  injurySeverityRank,
  mapSleeperInjuryStatus,
  moreSeriousInjuryStatus,
  type EspnInjuryRow,
} from "../src/lib/espn/injuries";
import type { FantasyPlayer, InjuryStatus } from "../src/lib/types";

assert.ok(injurySeverityRank("DOUBTFUL") > injurySeverityRank("QUESTIONABLE"));
assert.ok(injurySeverityRank("OUT") > injurySeverityRank("DOUBTFUL"));
assert.ok(injurySeverityRank("IR") >= injurySeverityRank("OUT"));
assert.equal(
  moreSeriousInjuryStatus("QUESTIONABLE", "DOUBTFUL"),
  "DOUBTFUL",
);
assert.equal(moreSeriousInjuryStatus("OUT", "DOUBTFUL"), "OUT");
assert.equal(moreSeriousInjuryStatus("ACTIVE", "QUESTIONABLE"), "QUESTIONABLE");

assert.equal(mapSleeperInjuryStatus("Doubtful"), "DOUBTFUL");
assert.equal(mapSleeperInjuryStatus("Out"), "OUT");
assert.equal(mapSleeperInjuryStatus("Questionable"), "QUESTIONABLE");
assert.equal(mapSleeperInjuryStatus("IR"), "IR");
assert.equal(
  mapSleeperInjuryStatus("DNR"),
  null,
  "DNR is roster-authority, not an injury chip",
);
assert.equal(mapSleeperInjuryStatus(null), null);

const MONTGOMERY_ESPN = 4035538; // David Montgomery (common ESPN id)

function basePlayer(
  overrides: Partial<FantasyPlayer> & Pick<FantasyPlayer, "espnId" | "name">,
): FantasyPlayer {
  return {
    id: `espn-${overrides.espnId}`,
    position: "RB",
    nflTeam: "HOU",
    injuryStatus: "ACTIVE",
    projectedPoints: 10,
    actualPoints: null,
    percentOwned: 80,
    percentStarted: 50,
    ...overrides,
  };
}

const montgomery = basePlayer({
  espnId: MONTGOMERY_ESPN,
  name: "David Montgomery",
  injuryStatus: "ACTIVE",
});

const report: EspnInjuryRow[] = [
  {
    name: "David Montgomery",
    espnAthleteId: MONTGOMERY_ESPN,
    nflTeam: "HOU",
    position: "RB",
    status: "DOUBTFUL",
    detail: "groin",
  },
];

const afterEspn = applyInjuryReport([montgomery], report);
assert.equal(
  afterEspn[0]!.injuryStatus,
  "DOUBTFUL",
  "ESPN injury report must mark Montgomery Doubtful",
);

// Sleeper alone (report empty) still upgrades ACTIVE → Doubtful.
const afterSleeperOnly = applySleeperInjuryStatuses([montgomery], {
  byEspnId: new Map([[MONTGOMERY_ESPN, { injuryStatus: "Doubtful" }]]),
});
assert.equal(afterSleeperOnly[0]!.injuryStatus, "DOUBTFUL");

// More serious wins across sources: ESPN Q + Sleeper Out → Out.
const qPlayer = basePlayer({
  espnId: MONTGOMERY_ESPN,
  name: "David Montgomery",
  injuryStatus: "QUESTIONABLE",
});
const merged = applySleeperInjuryStatuses(
  applyInjuryReport(qPlayer ? [qPlayer] : [], [
    {
      ...report[0]!,
      status: "QUESTIONABLE",
    },
  ]),
  {
    byEspnId: new Map([[MONTGOMERY_ESPN, { injuryStatus: "Out" }]]),
  },
);
assert.equal(merged[0]!.injuryStatus, "OUT");

// Softer Sleeper must not downgrade harder ESPN.
const outPlayer = applyInjuryReport(
  [basePlayer({ espnId: 1, name: "Deebo Samuel", nflTeam: "SF", injuryStatus: "ACTIVE" })],
  [
    {
      name: "Deebo Samuel",
      espnAthleteId: 1,
      nflTeam: "SF",
      position: "WR",
      status: "OUT",
      detail: null,
    },
  ],
);
const notDowngraded = applySleeperInjuryStatuses(outPlayer, {
  byEspnId: new Map([[1, { injuryStatus: "Questionable" }]]),
});
assert.equal(notDowngraded[0]!.injuryStatus, "OUT");

// Pool must call both apply paths.
const poolSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/players/pool.ts"),
  "utf8",
);
assert.match(poolSrc, /applyInjuryReport/);
assert.match(poolSrc, /applySleeperInjuryStatuses/);
assert.match(poolSrc, /fetchEspnInjuryReport/);
assert.match(poolSrc, /loadSleeperRosterDirectory/);

console.log("verify-pool-injury-merge: pure checks ok");
console.log(
  `  Montgomery severity path → ${afterEspn[0]!.injuryStatus as InjuryStatus}`,
);
console.log("verify-pool-injury-merge: ok");
