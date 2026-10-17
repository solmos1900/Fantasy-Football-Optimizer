/**
 * Regression guard for issue #88:
 * League trend refresh must not overwrite a stored real Player.nflTeam with
 * ESPN FA/unknown (proTeamId=0). Real incoming teams still update; create
 * still accepts whatever value is available.
 *
 * Run: npm run verify:trend-fa-wipe
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isFaOrUnknownTeam,
  nflTeamForPlayerUpdate,
  nflTeamFromEspn,
} from "../src/lib/espn/pro-teams";

// ── ESPN mapping: proTeamId=0 → FA ──────────────────────────────────
assert.equal(nflTeamFromEspn(0), "FA");
assert.equal(nflTeamFromEspn(0, "FA"), "FA");
assert.equal(nflTeamFromEspn(25), "SF");
assert.equal(nflTeamFromEspn(0, "SF"), "SF"); // preferred real abbrev wins

assert.equal(isFaOrUnknownTeam("FA"), true);
assert.equal(isFaOrUnknownTeam(""), true);
assert.equal(isFaOrUnknownTeam(null), true);
assert.equal(isFaOrUnknownTeam(undefined), true);
assert.equal(isFaOrUnknownTeam("  fa  "), true);
assert.equal(isFaOrUnknownTeam("SF"), false);
assert.equal(isFaOrUnknownTeam("MIN"), false);

// ── Update guard: incoming FA must not wipe a stored real team ──────
assert.equal(
  nflTeamForPlayerUpdate("FA", "SF"),
  "SF",
  "incoming FA must preserve stored SF",
);
assert.equal(
  nflTeamForPlayerUpdate("", "MIN"),
  "MIN",
  "empty incoming must preserve stored MIN",
);
assert.equal(
  nflTeamForPlayerUpdate(null, "ATL"),
  "ATL",
  "null incoming must preserve stored ATL",
);
assert.equal(
  nflTeamForPlayerUpdate("fa", "BUF"),
  "BUF",
  "case-insensitive FA must not wipe BUF",
);

// ── Real incoming team still updates ────────────────────────────────
assert.equal(
  nflTeamForPlayerUpdate("KC", "SF"),
  "KC",
  "real incoming team must overwrite prior team",
);
assert.equal(
  nflTeamForPlayerUpdate("LAR", "FA"),
  "LAR",
  "real incoming must replace stored FA",
);
assert.equal(
  nflTeamForPlayerUpdate("DET", null),
  "DET",
  "real incoming must write when existing is null",
);
assert.equal(
  nflTeamForPlayerUpdate("  GB  ", "CHI"),
  "GB",
  "real incoming is trimmed",
);

// ── Creation / both-FA: still accept available value ────────────────
assert.equal(
  nflTeamForPlayerUpdate("FA", null),
  "FA",
  "new/unknown row may be created as FA",
);
assert.equal(
  nflTeamForPlayerUpdate("FA", "FA"),
  "FA",
  "FA→FA stays FA",
);
assert.equal(
  nflTeamForPlayerUpdate("FA", ""),
  "FA",
  "FA over empty stays FA",
);
assert.equal(
  nflTeamForPlayerUpdate("", null),
  "FA",
  "empty incoming with no existing → FA",
);

// ── Source guards: trend upsert + pool share the helper ─────────────
const trendsSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/insights/trends.ts"),
  "utf8",
);
assert.match(trendsSrc, /nflTeamForPlayerUpdate/);
assert.match(trendsSrc, /isFaOrUnknownTeam/);

const upsertStart = trendsSrc.indexOf("async function upsertPlayer");
assert.ok(upsertStart >= 0, "upsertPlayer must exist");
const upsertEnd = trendsSrc.indexOf(
  "export async function refreshProjectionTrends",
  upsertStart,
);
const upsertFn = trendsSrc.slice(upsertStart, upsertEnd);
assert.match(
  upsertFn,
  /nflTeamForPlayerUpdate/,
  "upsertPlayer must use nflTeamForPlayerUpdate on update",
);
assert.match(
  upsertFn,
  /create:\s*\{[\s\S]*nflTeam:\s*player\.nflTeam/,
  "create must still write the incoming nflTeam as-is",
);
// Ban the pre-#88 wipe: update unconditionally assigned player.nflTeam.
assert.doesNotMatch(
  upsertFn,
  /update:\s*\{[\s\S]*nflTeam:\s*player\.nflTeam/,
  "update must not unconditionally assign nflTeam: player.nflTeam",
);

const poolSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/players/pool.ts"),
  "utf8",
);
assert.match(
  poolSrc,
  /nflTeamForPlayerUpdate/,
  "public pool must share the same FA guard helper",
);

console.log("verify-trend-fa-wipe: ok");
console.log("  FA incoming preserves stored real team");
console.log("  real incoming still updates");
console.log("  create/FA-only paths still accept FA");
