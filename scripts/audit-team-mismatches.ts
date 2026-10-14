/**
 * Audit Sleeper ↔ nflverse team mismatches with evidence.
 * Run: npx tsx scripts/audit-team-mismatches.ts
 */

import { buildAuthoritativeRosterMap } from "../src/lib/players/roster-authority";
import { loadSleeperRosterDirectory } from "../src/lib/sleeper/players";
import {
  loadNflverseWeeklyRoster,
  normalizePlayerNameKey,
} from "../src/lib/nflverse/weekly-roster";
import { loadPlayerIdCrosswalk } from "../src/lib/nflverse/crosswalk";
import { normalizeNflAbbrev } from "../src/lib/espn/pro-teams";
import { prisma } from "../src/lib/db";

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
  console.log("PENDING_SAME_DAY", roster.pendingSameDayCount);
  console.log("SINGLE_SOURCE", roster.singleSourceCount);
  console.log("PRACTICE_SQUAD", roster.practiceSquadCount);

  console.log("\n## RESOLUTION_TABLE");
  console.log(
    "| Player | Sleeper team | nflverse weekly | True team | Evidence | Disposition |",
  );
  console.log("| --- | --- | --- | --- | --- | --- |");

  for (const h of HISTORIC_MISMATCH_SLEEPER_IDS) {
    const sl = sleeper.bySleeperId.get(h.sid) ?? null;
    let wk = weekly.bySleeperId.get(h.sid) ?? null;
    if (!wk && sl?.gsisId) wk = weekly.byGsisId.get(sl.gsisId.trim()) ?? null;
    if (!wk && sl) {
      const key = `${normalizePlayerNameKey(sl.name)}|${sl.position}`;
      wk = weekly.byNamePosUnique.get(key) ?? null;
    }
    // Name search for Gordon/Lang when Sleeper name differs slightly
    if (!wk) {
      const key = `${normalizePlayerNameKey(h.label)}|${sl?.position ?? "TE"}`;
      wk = weekly.byNamePosUnique.get(key) ?? null;
    }

    const auth =
      roster.bySleeperId.get(h.sid) ??
      (sl?.espnId != null ? roster.byEspnId.get(sl.espnId) : undefined) ??
      (wk?.espnId != null ? roster.byEspnId.get(wk.espnId) : undefined) ??
      (wk?.gsisId
        ? roster.byEspnId.get(crosswalk.gsisToEspn.get(wk.gsisId) ?? -1)
        : undefined);

    const sleeperTeam = clean(sl?.team);
    const weeklyTeam = wk ? clean(wk.team) : null;
    const weeklyStatus = wk?.status ?? null;
    const trueTeam =
      auth?.nflTeam && auth.nflTeam !== "FA" ? auth.nflTeam : "FA";
    const newsIso = sl?.newsUpdatedMs
      ? new Date(sl.newsUpdatedMs).toISOString()
      : null;

    let disposition: string;
    if (auth?.staleSleeper) {
      disposition = "INACTIVE/FA (stale Sleeper 2021–23; no 2026 weekly)";
    } else if (auth?.teamMismatch) {
      disposition = auth.pendingSameDay
        ? "PENDING_SAME_DAY (UI notice)"
        : "DATAISSUE (flagged; excluded from pool)";
    } else if (auth?.singleSourceTeam && auth.practiceSquad) {
      disposition = "PRACTICE_SQUAD (Sleeper-only; UI Practice squad label)";
    } else if (auth?.singleSourceTeam) {
      disposition = "SINGLE_SOURCE (Sleeper-only; UI notice)";
    } else if (auth?.practiceSquad) {
      disposition = "PRACTICE_SQUAD (nflverse DEV; UI label)";
    } else if (
      wk &&
      weeklyStatus &&
      ["CUT", "EXE"].includes(weeklyStatus) &&
      sleeperTeam &&
      weeklyTeam !== sleeperTeam
    ) {
      disposition = "POST_CUT_SIGNING (Sleeper more recent)";
    } else if (sleeperTeam && weeklyTeam && sleeperTeam === weeklyTeam) {
      disposition = "RESOLVED (Sleeper + weekly agree via sleeper_id/gsis)";
    } else if (!auth?.pickerEligible) {
      disposition = "EXCLUDED from pool";
    } else {
      disposition = "RESOLVED (most-recent transaction wins)";
    }

    // Browning note correction: previous team TB (not CIN)
    const browningNote =
      h.sid === "6111"
        ? " previous team TB (not CIN; players.csv stale CIN from 2025); LAC practice squad"
        : "";
    const wayneNote =
      h.sid === "11056"
        ? " HOU waived week 6 / ~Oct 12; MIA is Sleeper-only"
        : "";

    const evidenceParts = [
      newsIso ? `Sleeper news_updated ${newsIso}` : null,
      wk
        ? `nflverse weekly week ${wk.week} ${wk.team} ${wk.status}${wk.espnId ? ` (espn ${wk.espnId})` : ""}${wk.gsisId ? ` gsis ${wk.gsisId}` : ""}${wk.sleeperId ? "" : " [no sleeper_id on weekly row]"}`
        : "nflverse weekly: no 2026 row",
      auth?.evidence ?? null,
      browningNote || wayneNote || null,
    ].filter(Boolean);

    console.log(
      `| ${h.label} | ${sleeperTeam ?? "—"} | ${wk ? `${weeklyTeam ?? wk.team} (${weeklyStatus})` : "—"} | ${trueTeam}${auth?.practiceSquad ? " · PS" : ""} | ${evidenceParts.join("; ")} | ${disposition} |`,
    );
  }

  console.log("\nUNEXPLAINED_OPEN_MISMATCHES", openMismatches.length);
  for (const m of openMismatches) {
    console.log(
      JSON.stringify({
        name: m.name,
        espnId: m.espnId,
        sleeper: m.sleeperTeam,
        nflverse: m.nflverseTeam,
        resolved: m.nflTeam,
        evidence: m.evidence,
        pending: m.pendingSameDay,
      }),
    );
  }

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
  let faOk = 0;
  let faBad = 0;
  for (const fa of fas.slice(0, 20)) {
    const sl =
      (fa.sleeperId ? sleeper.bySleeperId.get(fa.sleeperId) : undefined) ??
      sleeper.byEspnId.get(fa.espnId) ??
      null;
    const auth = roster.byEspnId.get(fa.espnId);
    const sleeperRostered = Boolean(sl?.active && sl.team);
    const authEligible = auth?.pickerEligible === true && auth.nflTeam !== "FA";
    const trulyUnsigned = !sleeperRostered && !authEligible;
    if (trulyUnsigned) faOk += 1;
    else faBad += 1;
    console.log(
      `| ${fa.name} | ${fa.espnId} | ${fa.nflTeam || "—"} | ${sl?.team ?? "—"} | ${trulyUnsigned ? "UNSIGNED (ok)" : "FALSE_FA"} |`,
    );
  }
  console.log("FA_SAMPLE_OK", faOk, "FA_SAMPLE_BAD", faBad);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
