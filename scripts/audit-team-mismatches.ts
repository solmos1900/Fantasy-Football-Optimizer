/**
 * Audit Sleeper ↔ nflverse team mismatches with evidence.
 * Resolves the historical 29 "mismatches" (mostly identity collisions)
 * using sleeper_id joins + most-recent-transaction priority.
 *
 * Run: npx tsx scripts/audit-team-mismatches.ts
 */

import { buildAuthoritativeRosterMap } from "../src/lib/players/roster-authority";
import { loadSleeperRosterDirectory } from "../src/lib/sleeper/players";
import { loadNflverseWeeklyRoster } from "../src/lib/nflverse/weekly-roster";
import { loadPlayerIdCrosswalk } from "../src/lib/nflverse/crosswalk";
import { normalizeNflAbbrev } from "../src/lib/espn/pro-teams";
import { prisma } from "../src/lib/db";

/** The 29 espnIds previously flagged (often wrong identity via name match). */
const HISTORIC_MISMATCH_SLEEPER_IDS = [
  { sid: "3702", label: "Andy Jones" },
  { sid: "13582", label: "Anthony Smith" },
  { sid: "7865", label: "Brandon Smith" },
  { sid: "5223", label: "Caleb Scott" },
  { sid: "10444", label: "Cedric Tillman" },
  { sid: "10228", label: "Charlie Jones" },
  { sid: "13353", label: "Chris Brazzell" },
  { sid: "11370", label: "Chris Brooks" },
  { sid: "6016", label: "Dax Raymond" },
  { sid: "11820", label: "Devin Culp" },
  { sid: "12476", label: "Devin Neal" },
  { sid: "5288", label: "Donnie Ernsberger" },
  { sid: "11608", label: "Isaiah Williams" },
  { sid: "6111", label: "Jake Browning" },
  { sid: "11056", label: "Jared Wayne" },
  { sid: "12761", label: "Jordan Moore" },
  { sid: "12787", label: "Josh Williams" },
  { sid: "5374", label: "Justin Watson" },
  { sid: "12504", label: "Kaleb Johnson" },
  { sid: "12547", label: "Kyle Williams" },
  { sid: "13032", label: "Marshall Lang" },
  { sid: "11628", label: "Marvin Harrison Jr." },
  { sid: "6992", label: "Michael Warren" },
  { sid: "1604", label: "Nick Williams" },
  { sid: "12493", label: "Oronde Gadsden II" },
  { sid: "11421", label: "Ryan Miller" },
  { sid: "13249", label: "Thomas Gordon" },
  { sid: "7149", label: "Tommy Stevens" },
  { sid: "5133", label: "Tyler Conklin" },
];

function clean(t: string | null | undefined): string | null {
  const n = normalizeNflAbbrev((t ?? "").trim().toUpperCase());
  if (!n || n === "FA" || n === "NONE") return null;
  return n;
}

async function main() {
  const [roster, sleeper, weekly, crosswalk] = await Promise.all([
    buildAuthoritativeRosterMap({ forceRefresh: true }),
    loadSleeperRosterDirectory({ forceRefresh: true }),
    loadNflverseWeeklyRoster(),
    loadPlayerIdCrosswalk(),
  ]);

  const openMismatches = [...roster.byEspnId.values()].filter(
    (e) => e.teamMismatch,
  );
  console.log("OPEN_TEAM_MISMATCHES", openMismatches.length);
  console.log(
    "PENDING_SAME_DAY",
    roster.pendingSameDayCount ??
      openMismatches.filter((e) => e.pendingSameDay).length,
  );

  console.log("\n## RESOLUTION_TABLE");
  console.log(
    "| Player | Sleeper team | nflverse weekly | True team | Evidence | Disposition |",
  );
  console.log(
    "| --- | --- | --- | --- | --- | --- |",
  );

  const rows: Array<Record<string, unknown>> = [];
  for (const h of HISTORIC_MISMATCH_SLEEPER_IDS) {
    const sl = sleeper.bySleeperId.get(h.sid) ?? null;
    const wk = weekly.bySleeperId.get(h.sid) ?? null;
    const auth =
      roster.bySleeperId.get(h.sid) ??
      (sl?.espnId != null ? roster.byEspnId.get(sl.espnId) : undefined) ??
      (wk?.espnId != null ? roster.byEspnId.get(wk.espnId) : undefined);

    // Stale players.csv team via wrong espn (what caused the old false mismatch)
    const wrongEspn = sl?.espnId;
    const gsis = wrongEspn != null ? crosswalk.espnToGsis.get(wrongEspn) : null;
    const staleCsv = gsis ? crosswalk.meta.get(gsis) : null;

    const sleeperTeam = clean(sl?.team);
    const weeklyTeam = wk && clean(wk.team);
    const weeklyStatus = wk?.status ?? null;
    const trueTeam = auth?.nflTeam && auth.nflTeam !== "FA" ? auth.nflTeam : sleeperTeam;
    const newsIso = sl?.newsUpdatedMs
      ? new Date(sl.newsUpdatedMs).toISOString()
      : null;

    let disposition: string;
    if (auth?.teamMismatch) {
      disposition = auth.pendingSameDay
        ? "PENDING_SAME_DAY (UI notice)"
        : "UNEXPLAINED_MISMATCH";
    } else if (
      wk &&
      weeklyStatus &&
      ["CUT", "EXE"].includes(weeklyStatus) &&
      sleeperTeam &&
      weeklyTeam !== sleeperTeam
    ) {
      disposition = "POST_CUT_SIGNING (Sleeper more recent)";
    } else if (
      wk &&
      wk.espnId != null &&
      wrongEspn != null &&
      wk.espnId !== wrongEspn &&
      staleCsv?.nflTeam &&
      sleeperTeam &&
      clean(staleCsv.nflTeam) !== sleeperTeam
    ) {
      disposition = "IDENTITY_COLLISION (Sleeper espn_id pointed at wrong nflverse row)";
    } else if (
      !wk &&
      staleCsv?.nflTeam &&
      sleeperTeam &&
      clean(staleCsv.nflTeam) !== sleeperTeam &&
      newsIso &&
      newsIso.startsWith("2026")
    ) {
      disposition = "MOST_RECENT_TXN (Sleeper news; players.csv team stale)";
    } else if (
      !wk &&
      staleCsv &&
      (staleCsv.position !== (sl?.position ?? "") ||
        (staleCsv.name &&
          sl?.name &&
          staleCsv.name.toLowerCase() !== sl.name.toLowerCase()))
    ) {
      disposition = "IDENTITY_COLLISION (name/espn matched wrong nflverse row)";
    } else if (sleeperTeam && weeklyTeam && sleeperTeam === weeklyTeam) {
      disposition = "RESOLVED (Sleeper + weekly agree via sleeper_id)";
    } else if (sleeperTeam && !wk) {
      disposition = "RESOLVED (Sleeper only; weekly has no 2026 row)";
    } else {
      disposition = "RESOLVED (most-recent transaction wins)";
    }

    const evidenceParts = [
      newsIso ? `Sleeper news_updated ${newsIso}` : null,
      wk
        ? `nflverse weekly week ${wk.week} ${wk.team} ${wk.status} (espn ${wk.espnId})`
        : "nflverse weekly: no 2026 row",
      staleCsv
        ? `stale players.csv via espn ${wrongEspn}: ${staleCsv.name} ${staleCsv.nflTeam} ${staleCsv.status} ${staleCsv.position}`
        : null,
      auth?.evidence ?? null,
    ].filter(Boolean);

    const markdown = `| ${h.label} | ${sleeperTeam ?? "—"} | ${wk ? `${weeklyTeam ?? wk.team} (${weeklyStatus})` : "—"} | ${trueTeam ?? "—"} | ${evidenceParts.join("; ")} | ${disposition} |`;
    console.log(markdown);

    rows.push({
      player: h.label,
      sleeperId: h.sid,
      sleeperTeam,
      nflverseWeekly: wk
        ? { team: weeklyTeam, status: weeklyStatus, week: wk.week, espnId: wk.espnId }
        : null,
      trueTeam,
      evidence: evidenceParts,
      disposition,
      authMismatch: auth?.teamMismatch ?? false,
      pendingSameDay: auth?.pendingSameDay ?? false,
    });
  }

  const unexplained = rows.filter(
    (r) =>
      r.disposition === "UNEXPLAINED_MISMATCH" ||
      (r.authMismatch && !r.pendingSameDay),
  );
  console.log("\nUNEXPLAINED_COUNT", unexplained.length);
  console.log("JSON_ROWS_START");
  for (const r of rows) console.log(JSON.stringify(r));
  console.log("JSON_ROWS_END");

  // Sample 20 DB FAs vs Sleeper
  const fas = await prisma.player.findMany({
    where: {
      position: { in: ["QB", "RB", "WR", "TE"] },
      OR: [{ nflTeam: null }, { nflTeam: "FA" }, { nflTeam: "" }],
    },
    take: 200,
    orderBy: { updatedAt: "desc" },
    select: {
      espnId: true,
      name: true,
      nflTeam: true,
      position: true,
      sleeperId: true,
    },
  });
  console.log("\n## FA_SAMPLE (20 of", fas.length, "DB FAs)");
  console.log(
    "| Player | espnId | DB | Sleeper team | Sleeper active | Auth eligible | Verdict |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  let faOk = 0;
  let faBad = 0;
  for (const fa of fas.slice(0, 20)) {
    const sl =
      (fa.sleeperId
        ? sleeper.bySleeperId.get(fa.sleeperId)
        : undefined) ??
      sleeper.byEspnId.get(fa.espnId) ??
      null;
    const auth = roster.byEspnId.get(fa.espnId);
    const sleeperRostered = Boolean(sl?.active && sl.team);
    const authEligible = auth?.pickerEligible === true && auth.nflTeam !== "FA";
    const trulyUnsigned = !sleeperRostered && !authEligible;
    if (trulyUnsigned) faOk += 1;
    else faBad += 1;
    const verdict = trulyUnsigned
      ? "UNSIGNED (ok)"
      : `FALSE_FA sleeper=${sl?.team ?? "—"} auth=${auth?.nflTeam ?? "—"}`;
    console.log(
      `| ${fa.name} | ${fa.espnId} | ${fa.nflTeam || "—"} | ${sl?.team ?? "—"} | ${sl?.active ?? "—"} | ${authEligible} | ${verdict} |`,
    );
  }
  console.log("FA_SAMPLE_OK", faOk, "FA_SAMPLE_BAD", faBad);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
