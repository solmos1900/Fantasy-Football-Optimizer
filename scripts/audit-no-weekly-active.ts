/**
 * Players Sleeper lists active+team with zero 2026 nflverse weekly rows.
 * Compare injury DNR / prior-season RES to find Left Squad cases.
 */
import { loadSleeperRosterDirectory } from "../src/lib/sleeper/players";
import { loadNflverseWeeklyRoster } from "../src/lib/nflverse/weekly-roster";
import { fetchText, parseCsv } from "../src/lib/nflverse/csv";
import { defaultEspnSeason } from "../src/lib/season";

async function loadPriorLatestStatus(season: number) {
  const url = `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`;
  const text = await fetchText(url);
  const rows = parseCsv(text);
  const byEspn = new Map<number, { week: number; team: string; status: string; name: string }>();
  for (const row of rows) {
    const pos = (row.position ?? "").trim().toUpperCase();
    if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
    const espnId = Number(row.espn_id);
    if (!Number.isFinite(espnId) || espnId <= 0) continue;
    const week = Number(row.week);
    if (!Number.isFinite(week)) continue;
    const prev = byEspn.get(espnId);
    if (prev && prev.week >= week) continue;
    byEspn.set(espnId, {
      week,
      team: (row.team ?? "").toUpperCase(),
      status: (row.status ?? "").toUpperCase(),
      name: (row.full_name ?? "").trim(),
    });
  }
  return byEspn;
}

async function main() {
  const season = defaultEspnSeason();
  const [sleeper, weekly, prior] = await Promise.all([
    loadSleeperRosterDirectory({ forceRefresh: true }),
    loadNflverseWeeklyRoster({ season }),
    loadPriorLatestStatus(season - 1),
  ]);

  // Need injury from raw sleeper — reload lightweight
  const raw = (await (await fetch("https://api.sleeper.app/v1/players/nfl")).json()) as Record<
    string,
    Record<string, unknown>
  >;
  const injuryBySid = new Map<string, string | null>();
  for (const [sid, p] of Object.entries(raw)) {
    injuryBySid.set(sid, (p.injury_status as string | null) ?? null);
  }

  const suspects: Array<Record<string, unknown>> = [];
  for (const sl of sleeper.allSkill) {
    if (!sl.active || !sl.team) continue;
    if (weekly.bySleeperId.has(sl.sleeperId)) continue;
    if (sl.gsisId && weekly.byGsisId.has(sl.gsisId)) continue;
    if (sl.espnId != null && weekly.byEspnId.has(sl.espnId)) continue;
    const priorRow = sl.espnId != null ? prior.get(sl.espnId) : undefined;
    const injury = injuryBySid.get(sl.sleeperId);
    suspects.push({
      name: sl.name,
      espnId: sl.espnId,
      team: sl.team,
      status: sl.status,
      injury,
      prior: priorRow ?? null,
      news: sl.newsUpdatedMs ? new Date(sl.newsUpdatedMs).toISOString() : null,
    });
  }
  console.log("NO_2026_WEEKLY_COUNT", suspects.length);
  const flagged = suspects.filter(
    (s) =>
      s.injury === "DNR" ||
      (s.prior &&
        typeof s.prior === "object" &&
        ["RES", "LEFT", "NFI", "PUP"].includes(
          String((s.prior as { status: string }).status),
        )),
  );
  console.log("FLAGGED_PRIOR_RES_OR_DNR", flagged.length);
  for (const s of flagged.slice(0, 40)) console.log(JSON.stringify(s));
  console.log("\nSample others (first 15):");
  for (const s of suspects
    .filter((x) => !flagged.includes(x))
    .slice(0, 15)) {
    console.log(JSON.stringify(s));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
