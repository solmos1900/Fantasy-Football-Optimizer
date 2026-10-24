/**
 * Regression: injury badge = more serious of ESPN + Sleeper (#137).
 * Named examples from the issue (full name + NFL team).
 *
 * - Sleeper match falls back to normalized name+team when espn_id is null
 * - ESPN name match strips Jr./Sr./II and apostrophes
 * - PUP maps into the severity ranking (same band as IR/OUT)
 *
 * Run: npm run verify:injury-more-serious
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyInjuryReport,
  applySleeperInjuryStatuses,
  injuryNameTeamKey,
  injurySeverityRank,
  mapSleeperInjuryStatus,
  mapStatus,
  moreSeriousInjuryStatus,
  type EspnInjuryRow,
} from "../src/lib/espn/injuries";
import type { FantasyPlayer, InjuryStatus } from "../src/lib/types";

assert.equal(mapStatus("PUP"), "PUP");
assert.equal(mapStatus("Physically Unable to Perform"), "PUP");
assert.equal(mapSleeperInjuryStatus("PUP"), "PUP");
assert.equal(mapSleeperInjuryStatus("NFI"), "OUT");
assert.equal(mapSleeperInjuryStatus("DNR"), null);
assert.ok(injurySeverityRank("PUP") >= injurySeverityRank("OUT"));
assert.ok(injurySeverityRank("PUP") > injurySeverityRank("DOUBTFUL"));
assert.equal(moreSeriousInjuryStatus("OUT", "PUP"), "OUT"); // same band; prefer first when tied
assert.equal(moreSeriousInjuryStatus("QUESTIONABLE", "PUP"), "PUP");

assert.equal(
  injuryNameTeamKey("Brian Robinson Jr.", "ATL"),
  injuryNameTeamKey("Brian Robinson", "ATL"),
);
assert.equal(
  injuryNameTeamKey("Tre' Harris", "LAC"),
  injuryNameTeamKey("Tre Harris", "LAC"),
);
assert.equal(
  injuryNameTeamKey("Luther Burden III", "CHI"),
  injuryNameTeamKey("Luther Burden", "CHI"),
);

function basePlayer(
  overrides: Partial<FantasyPlayer> &
    Pick<FantasyPlayer, "espnId" | "name" | "nflTeam">,
): FantasyPlayer {
  return {
    id: `espn-${overrides.espnId}`,
    position: "RB",
    injuryStatus: "ACTIVE",
    projectedPoints: 8,
    actualPoints: null,
    percentOwned: 10,
    percentStarted: 5,
    ...overrides,
  };
}

// --- Jawhar Jordan (HOU): Sleeper Out, no ESPN id on Sleeper ---
{
  const players = [
    basePlayer({
      espnId: 4685722,
      name: "Jawhar Jordan",
      nflTeam: "HOU",
      position: "RB",
    }),
  ];
  const after = applySleeperInjuryStatuses(players, {
    byEspnId: new Map(), // no espn_id on Sleeper
    allSkill: [
      {
        name: "Jawhar Jordan",
        team: "HOU",
        injuryStatus: "Out",
      },
    ],
  });
  assert.equal(
    after[0]!.injuryStatus,
    "OUT",
    "Jawhar Jordan (HOU) must pick up Sleeper Out via name+team",
  );
}

// --- Dalton Kincaid (BUF): Sleeper Questionable, no ESPN id ---
{
  const players = [
    basePlayer({
      espnId: 4430027,
      name: "Dalton Kincaid",
      nflTeam: "BUF",
      position: "TE",
    }),
  ];
  const after = applySleeperInjuryStatuses(players, {
    byEspnId: new Map(),
    allSkill: [
      {
        name: "Dalton Kincaid",
        team: "BUF",
        injuryStatus: "Questionable",
      },
    ],
  });
  assert.equal(
    after[0]!.injuryStatus,
    "QUESTIONABLE",
    "Dalton Kincaid (BUF) must show Questionable from Sleeper name+team",
  );
}

// --- Brian Robinson (ATL): ESPN "Brian Robinson Jr." vs pool "Brian Robinson" ---
{
  const players = [
    basePlayer({
      espnId: 4241479,
      name: "Brian Robinson",
      nflTeam: "ATL",
      position: "RB",
    }),
  ];
  const report: EspnInjuryRow[] = [
    {
      name: "Brian Robinson Jr.",
      espnAthleteId: null, // feed often lacks athlete id
      nflTeam: "ATL",
      position: "RB",
      status: "QUESTIONABLE",
      detail: "hamstring",
    },
  ];
  const after = applyInjuryReport(players, report);
  assert.equal(
    after[0]!.injuryStatus,
    "QUESTIONABLE",
    "Brian Robinson (ATL) must match ESPN Jr. name",
  );
}

// --- Tre Harris (LAC): apostrophe / Out from Sleeper ---
{
  const players = [
    basePlayer({
      espnId: 4430871,
      name: "Tre Harris",
      nflTeam: "LAC",
      position: "WR",
    }),
  ];
  const report: EspnInjuryRow[] = [
    {
      name: "Tre' Harris",
      espnAthleteId: null,
      nflTeam: "LAC",
      position: "WR",
      status: "QUESTIONABLE",
      detail: "hamstring",
    },
  ];
  const afterEspn = applyInjuryReport(players, report);
  assert.equal(afterEspn[0]!.injuryStatus, "QUESTIONABLE");
  const after = applySleeperInjuryStatuses(afterEspn, {
    byEspnId: new Map(),
    allSkill: [
      { name: "Tre' Harris", team: "LAC", injuryStatus: "Out" },
    ],
  });
  assert.equal(
    after[0]!.injuryStatus,
    "OUT",
    "Tre Harris (LAC): Sleeper Out beats ESPN Questionable",
  );
}

// --- Luke Musgrave (GB): Sleeper PUP ---
{
  const players = [
    basePlayer({
      espnId: 4430801,
      name: "Luke Musgrave",
      nflTeam: "GB",
      position: "TE",
      injuryStatus: "OUT",
    }),
  ];
  const after = applySleeperInjuryStatuses(players, {
    byEspnId: new Map(),
    allSkill: [
      { name: "Luke Musgrave", team: "GB", injuryStatus: "PUP" },
    ],
  });
  assert.equal(
    after[0]!.injuryStatus as InjuryStatus,
    "OUT",
    "same severity band: keep existing OUT when Sleeper is PUP",
  );
  const fromActive = applySleeperInjuryStatuses(
    [
      basePlayer({
        espnId: 4430801,
        name: "Luke Musgrave",
        nflTeam: "GB",
        position: "TE",
      }),
    ],
    {
      byEspnId: new Map(),
      allSkill: [
        { name: "Luke Musgrave", team: "GB", injuryStatus: "PUP" },
      ],
    },
  );
  assert.equal(
    fromActive[0]!.injuryStatus,
    "PUP",
    "Luke Musgrave (GB) ACTIVE → PUP from Sleeper",
  );
}

// --- Brandon Aiyuk (SF): ESPN Out; Sleeper DNR ignored ---
{
  const players = [
    basePlayer({
      espnId: 4362628,
      name: "Brandon Aiyuk",
      nflTeam: "SF",
      position: "WR",
    }),
  ];
  const report: EspnInjuryRow[] = [
    {
      name: "Brandon Aiyuk",
      espnAthleteId: 4362628,
      nflTeam: "SF",
      position: "WR",
      status: "OUT",
      detail: "personal",
    },
  ];
  const afterEspn = applyInjuryReport(players, report);
  const after = applySleeperInjuryStatuses(afterEspn, {
    byEspnId: new Map([
      [4362628, { injuryStatus: "DNR", name: "Brandon Aiyuk", team: "SF" }],
    ]),
  });
  assert.equal(
    after[0]!.injuryStatus,
    "OUT",
    "Brandon Aiyuk (SF): ESPN Out; DNR must not clear it",
  );
}

// --- Ladd McConkey (LAC): ESPN Q + Sleeper Out → Out ---
{
  const players = [
    basePlayer({
      espnId: 4430802,
      name: "Ladd McConkey",
      nflTeam: "LAC",
      position: "WR",
      injuryStatus: "QUESTIONABLE",
    }),
  ];
  const after = applySleeperInjuryStatuses(players, {
    byEspnId: new Map([
      [4430802, { injuryStatus: "Out", name: "Ladd McConkey", team: "LAC" }],
    ]),
  });
  assert.equal(after[0]!.injuryStatus, "OUT", "Ladd McConkey (LAC) → Out");
}

// Pool must pass the full Sleeper directory (not espnId-only).
const poolSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/players/pool.ts"),
  "utf8",
);
assert.match(poolSrc, /applySleeperInjuryStatuses/);
assert.match(poolSrc, /allSkill/);
assert.match(poolSrc, /byNameTeam/);

const injuriesSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/espn/injuries.ts"),
  "utf8",
);
assert.match(injuriesSrc, /injuryNameTeamKey/);
assert.match(injuriesSrc, /normalizePlayerNameKey/);
assert.match(injuriesSrc, /case \"PUP\"/);

console.log("verify-injury-more-serious: ok");
console.log(
  "  Jawhar Jordan (HOU), Dalton Kincaid (BUF), Brian Robinson (ATL), Tre Harris (LAC), Luke Musgrave (GB), Brandon Aiyuk (SF), Ladd McConkey (LAC)",
);
