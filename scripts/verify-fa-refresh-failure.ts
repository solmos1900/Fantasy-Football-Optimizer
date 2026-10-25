/**
 * Regression guard for issue #109:
 * When kona_player_info fails during Sync, keep the previously cached free-agent
 * list and surface a sync warning — never silently save freeAgents: [].
 *
 * Run: npm run verify:fa-refresh-failure
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  FREE_AGENT_REFRESH_WARNING,
  freeAgentsAfterRefreshFailure,
} from "../src/lib/espn/client";
import { freeAgentsFromCachedPayload } from "../src/lib/league/service";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";

function stubFa(name: string, espnId: number): FantasyPlayer {
  return {
    id: `p-${espnId}`,
    espnId,
    name,
    position: "RB",
    nflTeam: "SF",
    injuryStatus: "ACTIVE",
    projectedPoints: 8.5,
    actualPoints: null,
    percentOwned: 12,
    percentStarted: 2,
  };
}

const prior = [stubFa("Kept Runner", 101), stubFa("Kept Receiver", 202)];

// Failed refresh with a prior list → keep prior (not []).
assert.deepEqual(freeAgentsAfterRefreshFailure(prior), prior);
assert.notDeepEqual(freeAgentsAfterRefreshFailure(prior), []);

// Failed refresh with no prior → empty is honest, but caller must still warn.
assert.deepEqual(freeAgentsAfterRefreshFailure(undefined), []);
assert.deepEqual(freeAgentsAfterRefreshFailure([]), []);

assert.ok(
  FREE_AGENT_REFRESH_WARNING.length > 10,
  "warning text must be user-visible",
);
assert.match(FREE_AGENT_REFRESH_WARNING, /free agents/i);

// Cached payload parsing for Sync fallback.
const payload: LeagueData = {
  leagueId: "999",
  season: 2026,
  name: "Test",
  currentWeek: 4,
  scoringPeriodId: 4,
  isDemo: false,
  teams: [],
  matchups: [],
  freeAgents: prior,
  lastSyncedAt: "2026-10-01T00:00:00.000Z",
};
assert.deepEqual(
  freeAgentsFromCachedPayload(JSON.stringify(payload)),
  prior,
);
assert.equal(freeAgentsFromCachedPayload(null), undefined);
assert.equal(freeAgentsFromCachedPayload("not-json"), undefined);
assert.equal(
  freeAgentsFromCachedPayload(JSON.stringify({ ...payload, freeAgents: null })),
  undefined,
);

// Simulate the Sync merge: failure + prior → cached FAs + warning, not [].
const afterFailedRefresh = {
  freeAgents: freeAgentsAfterRefreshFailure(
    freeAgentsFromCachedPayload(JSON.stringify(payload)),
  ),
  syncWarnings: [FREE_AGENT_REFRESH_WARNING],
};
assert.equal(afterFailedRefresh.freeAgents.length, 2);
assert.equal(afterFailedRefresh.freeAgents[0]?.name, "Kept Runner");
assert.deepEqual(afterFailedRefresh.syncWarnings, [
  FREE_AGENT_REFRESH_WARNING,
]);

// ── source guards ────────────────────────────────────────────────────
const root = path.join(__dirname, "..");
const client = fs.readFileSync(
  path.join(root, "src/lib/espn/client.ts"),
  "utf8",
);
const fetchStart = client.indexOf("export async function fetchEspnLeague");
assert.ok(fetchStart >= 0);
const fetchFn = client.slice(
  fetchStart,
  client.indexOf("export async function enrichLeagueWithCompletedWeekOpponents"),
);
assert.match(
  fetchFn,
  /freeAgentsAfterRefreshFailure/,
  "fetchEspnLeague must keep prior FAs on failure",
);
assert.match(
  fetchFn,
  /FREE_AGENT_REFRESH_WARNING|syncWarnings/,
  "fetchEspnLeague must attach a sync warning on FA failure",
);
// Ban the pre-#109 wipe: catch { freeAgents = []; }
assert.doesNotMatch(
  fetchFn,
  /catch\s*\{\s*freeAgents\s*=\s*\[\s*\];\s*\}/,
  "must not silently assign freeAgents = [] in an empty catch",
);

const service = fs.readFileSync(
  path.join(root, "src/lib/league/service.ts"),
  "utf8",
);
assert.match(
  service,
  /fallbackFreeAgents:\s*freeAgentsFromCachedPayload/,
  "connectEspnLeague must pass cached FAs as fallback",
);

const syncRoute = fs.readFileSync(
  path.join(root, "src/app/api/league/sync/route.ts"),
  "utf8",
);
assert.match(
  syncRoute,
  /warning/,
  "sync API should surface a soft warning to the client",
);

const syncButton = fs.readFileSync(
  path.join(root, "src/components/sync-button.tsx"),
  "utf8",
);
assert.match(
  syncButton,
  /warning/,
  "SyncButton should display soft sync warnings",
);

console.log("verify-fa-refresh-failure: ok");
console.log("  failed FA refresh keeps prior list");
console.log("  warning string is set");
console.log("  fetchEspnLeague / service / Sync UI wired");
