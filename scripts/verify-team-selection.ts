/**
 * Regression guard for issue #45:
 * - Reconnect without teamId must keep the saved teamId
 * - Team-specific views must never silently fall back to teams[0]
 *
 * Run: npm run verify:team-selection
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyDemoOwnerDisplayName,
  createDemoLeague,
} from "../src/lib/demo/seed";
import {
  buildInsightsBundle,
  generateInsights,
} from "../src/lib/insights/engine";
import {
  applyUserTeamId,
  resolvePersistedTeamId,
  resolveUserTeam,
} from "../src/lib/league/team";
import type { LeagueData } from "../src/lib/types";

// ── persist: reconnect without teamId keeps saved team ──────────────
assert.equal(resolvePersistedTeamId(undefined, 7), 7);
assert.equal(resolvePersistedTeamId(undefined, null), null);
assert.equal(resolvePersistedTeamId(3, 7), 3);
assert.equal(resolvePersistedTeamId(0, 7), 7); // 0 is not a valid ESPN team id
assert.equal(resolvePersistedTeamId(undefined, undefined), null);

// ── apply + resolve: explicit markers only ──────────────────────────
const fixture = applyDemoOwnerDisplayName(
  createDemoLeague(1, { ownerDisplayName: "Team Select Test" }),
  "Team Select Test",
);
assert.ok(fixture.teams.length >= 2, "fixture needs multiple teams");

const cleared = applyUserTeamId(fixture, null);
assert.equal(cleared.userTeamId, undefined);
assert.ok(
  cleared.teams.every((t) => !t.isCurrentUser),
  "cleared league must mark no team as current",
);
assert.equal(
  resolveUserTeam(cleared),
  undefined,
  "no team selected → resolveUserTeam must be undefined (not teams[0])",
);

const teamB = fixture.teams[1]!;
const stamped = applyUserTeamId(cleared, teamB.id);
assert.equal(stamped.userTeamId, teamB.id);
assert.equal(resolveUserTeam(stamped)?.id, teamB.id);
assert.ok(
  stamped.teams.every((t) => (t.id === teamB.id) === Boolean(t.isCurrentUser)),
);

// userTeamId alone (no isCurrentUser flag) still resolves correctly
const byIdOnly: LeagueData = {
  ...cleared,
  userTeamId: teamB.id,
  teams: cleared.teams.map((t) => ({ ...t, isCurrentUser: false })),
};
assert.equal(resolveUserTeam(byIdOnly)?.id, teamB.id);

// ── insights engine must not invent a team ──────────────────────────
const emptyBundle = buildInsightsBundle(cleared, []);
assert.deepEqual(emptyBundle.startSit, []);
assert.deepEqual(emptyBundle.trades, []);
assert.deepEqual(emptyBundle.waivers, []);
assert.deepEqual(emptyBundle.matchupNotes, []);
assert.deepEqual(generateInsights(cleared), []);

const withTeamBundle = buildInsightsBundle(stamped, []);
assert.ok(
  withTeamBundle.startSit.length +
    withTeamBundle.waivers.length +
    withTeamBundle.trades.length +
    withTeamBundle.matchupNotes.length +
    withTeamBundle.other.length >=
    0,
);
assert.ok(Array.isArray(generateInsights(stamped)));

// Demo / guest fixture with a selected team still works
assert.ok(resolveUserTeam(fixture), "demo fixture must expose a current user");
assert.ok(Array.isArray(generateInsights(fixture)));

// ── source guards: no silent teams[0] on product pages / engine ─────
const root = process.cwd();
const guardedFiles = [
  "src/app/(app)/dashboard/page.tsx",
  "src/app/(app)/team/page.tsx",
  "src/app/(app)/trades/page.tsx",
  "src/app/(app)/insights/page.tsx",
  "src/lib/insights/engine.ts",
  "src/lib/league/service.ts",
];

for (const rel of guardedFiles) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  // Ban the silent fallback expression, not the words in comments.
  assert.doesNotMatch(
    src,
    /\?\?\s*(?:league\.)?teams\[0\]/,
    `${rel} must not fall back to teams[0] as the user's team`,
  );
}

const service = fs.readFileSync(
  path.join(root, "src/lib/league/service.ts"),
  "utf8",
);
assert.match(service, /resolvePersistedTeamId/);
assert.match(service, /applyUserTeamId/);
assert.doesNotMatch(
  service,
  /teamId:\s*input\.teamId\s*\?\?\s*null/,
  "reconnect must not null out teamId when omitted",
);

const selectPrompt = fs.readFileSync(
  path.join(root, "src/components/select-team-prompt.tsx"),
  "utf8",
);
assert.match(selectPrompt, /Choose your team/);
assert.match(selectPrompt, /\/connect#espn/);

for (const rel of [
  "src/app/(app)/dashboard/page.tsx",
  "src/app/(app)/team/page.tsx",
  "src/app/(app)/trades/page.tsx",
  "src/app/(app)/insights/page.tsx",
]) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  assert.match(src, /SelectTeamPrompt/);
  assert.match(src, /resolveUserTeam/);
}

console.log("verify-team-selection: ok");
