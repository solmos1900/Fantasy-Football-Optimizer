/**
 * Build ui-preview chat sample from live public sources (Week 7, 2026):
 * - Sleeper full-PPR projections + opponent
 * - nflverse stats_player_week fantasy_points_ppr (season / last-3 / spark)
 * - ESPN scoreboard for @/vs opponent labels
 *
 * Writes:
 *   src/app/ui-preview/chat/live-sample.json
 *   docs/screenshots/CHAT_SCREENSHOT_SOURCES.md
 *
 * Run: npx tsx scripts/build-chat-live-sample.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fetchGunzipText, parseCsv } from "../src/lib/nflverse/csv";
import { playerWeekStatsCsvGzUrl } from "../src/lib/nflverse/urls";
import { fullPprFromNflverseRow } from "../src/lib/players/scoring";
import {
  fetchSleeperProjections,
  sleeperNameTeamKey,
} from "../src/lib/sleeper/projections";
import { secureFetch } from "../src/lib/http/secure-fetch";
import {
  formatOpponentLabel,
  parseEspnScoreboard,
  scheduleMapWithByes,
} from "../src/lib/espn/scoreboard";
import {
  runTradeCompare,
  runWhoToStartCompare,
  type ChatPlayerMetricCard,
} from "../src/lib/chat/tool-runners";
import { formImpactLine } from "../src/lib/insights/tool-display";
import type { FantasyPlayer, LeagueData } from "../src/lib/types";
import type { PlayerPoolFreshness } from "../src/lib/players/pool";

const SEASON = 2026;
const CURRENT_WEEK = 7;
const STATS_THROUGH = 6;

type Target = {
  name: string;
  nflTeam: string;
  position: "WR" | "RB";
  espnId: number;
};

/** ESPN ids from nflverse players.csv (CC BY 4.0). */
const TARGETS: Target[] = [
  { name: "Puka Nacua", nflTeam: "LAR", position: "WR", espnId: 4426515 },
  { name: "Kyren Williams", nflTeam: "LAR", position: "RB", espnId: 4430737 },
  { name: "Ja'Marr Chase", nflTeam: "CIN", position: "WR", espnId: 4362628 },
  { name: "Chase Brown", nflTeam: "CIN", position: "RB", espnId: 4362238 },
  { name: "Amon-Ra St. Brown", nflTeam: "DET", position: "WR", espnId: 4374302 },
  { name: "DK Metcalf", nflTeam: "PIT", position: "WR", espnId: 4047650 },
];

type WeekRow = {
  week: number;
  points: number;
  opponentTeam: string;
  source: string;
};

async function loadNflverseWeeks(): Promise<Map<string, WeekRow[]>> {
  const text = await fetchGunzipText(playerWeekStatsCsvGzUrl(SEASON));
  const rows = parseCsv(text);
  const want = new Map(
    TARGETS.map((t) => [t.name.toLowerCase(), t] as const),
  );
  const out = new Map<string, WeekRow[]>();
  for (const row of rows) {
    const n = (row.player_display_name || row.player_name || "").trim();
    const key = n.toLowerCase();
    if (!want.has(key)) continue;
    const week = Number(row.week);
    if (!Number.isFinite(week) || week < 1 || week > STATS_THROUGH) continue;
    if ((row.season_type || "REG").toUpperCase() === "POST") continue;
    const ppr = fullPprFromNflverseRow(row);
    if (ppr == null) continue;
    const opponentTeam = (row.opponent_team || "").trim().toUpperCase();
    const list = out.get(key) ?? [];
    list.push({
      week,
      points: Math.round(ppr * 10) / 10,
      opponentTeam,
      source: `nflverse stats_player_week_${SEASON}.csv.gz · fantasy_points_ppr · week ${week}`,
    });
    out.set(key, list);
  }
  return out;
}

async function loadSchedule() {
  const res = await secureFetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${SEASON}&seasontype=2&week=${CURRENT_WEEK}`,
    { timeoutMs: 20_000, retries: 2 },
  );
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
  const raw = (await res.json()) as { events?: unknown[] };
  const parsed = parseEspnScoreboard(raw as never);
  return scheduleMapWithByes(
    parsed.byTeam,
    parsed.eventCount,
    TARGETS.map((t) => t.nflTeam),
  );
}

function mean(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function buildPlayer(
  t: Target,
  weeks: WeekRow[],
  proj: number | null,
  opponent: string | undefined,
): FantasyPlayer {
  const sorted = [...weeks].sort((a, b) => b.week - a.week);
  return {
    id: `espn-${t.espnId}`,
    espnId: t.espnId,
    name: t.name,
    position: t.position,
    nflTeam: t.nflTeam,
    injuryStatus: "ACTIVE",
    projectedPoints: proj,
    actualPoints: null,
    percentOwned: 90,
    percentStarted: 80,
    opponent,
    recentWeeks: sorted.map((w) => ({
      week: w.week,
      points: w.points,
      opponent: w.opponentTeam || undefined,
    })),
  };
}

function sourcesForCard(
  t: Target,
  weeks: WeekRow[],
  proj: number | null,
  opponent: string | undefined,
  card: ChatPlayerMetricCard,
) {
  const seasonPts = weeks.map((w) => w.points);
  const last3 = [...weeks]
    .sort((a, b) => b.week - a.week)
    .slice(0, 3)
    .map((w) => w.points);
  return {
    player: `${t.name} (${t.nflTeam})`,
    espnId: t.espnId,
    opponent: {
      value: opponent ?? null,
      source: `ESPN NFL scoreboard season ${SEASON} week ${CURRENT_WEEK} → formatOpponentLabel`,
    },
    seasonPpg: {
      value: card.seasonPpg,
      computedFrom: mean(seasonPts),
      weeks: weeks.map((w) => ({
        week: w.week,
        points: w.points,
        source: w.source,
      })),
    },
    last3Avg: {
      value: card.last3Avg,
      computedFrom: mean(last3),
      weeks: [...weeks]
        .sort((a, b) => b.week - a.week)
        .slice(0, 3)
        .map((w) => ({ week: w.week, points: w.points, source: w.source })),
    },
    sleeperProj: {
      value: proj,
      source: `Sleeper GET /projections/nfl/${SEASON}/${CURRENT_WEEK}?season_type=regular · stats.pts_ppr · name|team ${sleeperNameTeamKey(t.name, t.nflTeam)}`,
    },
    formLine: {
      value: card.formLine,
      source: "formImpactLine(player) from this player's recentWeeks only",
    },
    byeThisWeek: card.byeThisWeek,
  };
}

async function main() {
  console.log("Loading Sleeper projections, nflverse weeks, ESPN schedule…");
  const [projMap, weekMap, schedule] = await Promise.all([
    fetchSleeperProjections({ season: SEASON, week: CURRENT_WEEK }),
    loadNflverseWeeks(),
    loadSchedule(),
  ]);
  if (projMap.emptyFeed) {
    throw new Error("Sleeper projections empty — aborting live sample");
  }

  const players: FantasyPlayer[] = [];
  const perPlayerSources: ReturnType<typeof sourcesForCard>[] = [];

  for (const t of TARGETS) {
    const weeks = weekMap.get(t.name.toLowerCase()) ?? [];
    if (!weeks.length) {
      throw new Error(`No nflverse weeks for ${t.name}`);
    }
    const key = sleeperNameTeamKey(t.name, t.nflTeam);
    const proj =
      projMap.byEspnId.get(t.espnId) ??
      projMap.byNameTeam.get(key) ??
      null;
    if (proj == null) {
      throw new Error(`No Sleeper proj for ${t.name}`);
    }
    const opponent = formatOpponentLabel(t.nflTeam, schedule);
    const player = buildPlayer(t, weeks, proj, opponent);
    players.push(player);
  }

  const freshness: PlayerPoolFreshness = {
    season: SEASON,
    currentWeek: CURRENT_WEEK,
    statsThroughWeek: STATS_THROUGH,
    statsUpdatedAt: new Date().toISOString(),
    projectionsUpdatedAt: projMap.fetchedAt,
    latestWeekMissing: false,
    warning: null,
    scoringLabel: "full PPR",
  };

  const byName = new Map(players.map((p) => [p.name, p]));
  const puka = byName.get("Puka Nacua")!;
  const kyren = byName.get("Kyren Williams")!;
  const chase = byName.get("Ja'Marr Chase")!;
  const brown = byName.get("Chase Brown")!;
  const amon = byName.get("Amon-Ra St. Brown")!;
  const dk = byName.get("DK Metcalf")!;

  const trade = runTradeCompare({
    sideA: [puka, kyren],
    sideB: [chase, brown],
    freshness,
  });
  if (!trade.ok) throw new Error(`trade failed: ${trade.message}`);

  const league: LeagueData = {
    leagueId: "chat-live-sample",
    season: SEASON,
    name: "Live sample",
    currentWeek: CURRENT_WEEK,
    scoringPeriodId: CURRENT_WEEK,
    isDemo: false,
    teams: [],
    matchups: [],
    freeAgents: [amon, dk],
    lastSyncedAt: new Date().toISOString(),
  };
  const wts = runWhoToStartCompare({
    league,
    players: [amon, dk],
    freshness,
  });
  if (!wts.ok) throw new Error(`wts failed: ${wts.message}`);

  // Per-player consistency check before write
  for (const p of players) {
    const card =
      [...trade.sideA, ...trade.sideB, ...wts.players].find(
        (c) => c.espnId === p.espnId,
      ) ?? null;
    if (!card) continue;
    if (card.opponent !== (p.opponent ?? null)) {
      throw new Error(`${p.name}: opponent mismatch`);
    }
    if (card.formLine !== formImpactLine(p)) {
      throw new Error(`${p.name}: formLine mismatch`);
    }
    const weeks = weekMap.get(p.name.toLowerCase())!;
    perPlayerSources.push(
      sourcesForCard(
        TARGETS.find((t) => t.espnId === p.espnId)!,
        weeks,
        p.projectedPoints,
        p.opponent,
        card,
      ),
    );
  }

  const sample = {
    generatedAt: new Date().toISOString(),
    season: SEASON,
    currentWeek: CURRENT_WEEK,
    statsThroughWeek: STATS_THROUGH,
    note:
      "Built from public Sleeper + nflverse + ESPN scoreboard via the same chat tool runners (runTradeCompare / runWhoToStartCompare). Verdict text is the shared whoBenefitsCopy / compareWhoToStart headline (no AI Gateway).",
    trade: {
      userText: `Trade: LEFT ${puka.name} (${puka.nflTeam}) + ${kyren.name} (${kyren.nflTeam}) for RIGHT ${chase.name} (${chase.nflTeam}) + ${brown.name} (${brown.nflTeam})`,
      assistantOneLiner: trade.headline,
      toolOutput: trade,
      filledTemplate: {
        left: [
          { name: puka.name, nflTeam: puka.nflTeam },
          { name: kyren.name, nflTeam: kyren.nflTeam },
        ],
        right: [
          { name: chase.name, nflTeam: chase.nflTeam },
          { name: brown.name, nflTeam: brown.nflTeam },
        ],
      },
    },
    whoToStart: {
      userText: `Who to Start: ${amon.name} (${amon.nflTeam}) vs ${dk.name} (${dk.nflTeam})`,
      assistantOneLiner: wts.headline,
      toolOutput: wts,
    },
    sources: {
      projections: `https://api.sleeper.app/projections/nfl/${SEASON}/${CURRENT_WEEK}?season_type=regular`,
      weekStats: playerWeekStatsCsvGzUrl(SEASON),
      scoreboard: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${SEASON}&seasontype=2&week=${CURRENT_WEEK}`,
      players: perPlayerSources,
      tradeValues: {
        giveValue: trade.giveValue,
        receiveValue: trade.receiveValue,
        valueGap: trade.valueGap,
        pctGap: trade.pctGap,
        tier: trade.tier,
        tone: trade.tone,
        headline: trade.headline,
        valueBasis: trade.valueBasis,
        pctGapBasisLabel: trade.pctGapBasisLabel,
        source:
          "sideSeasonPpgTradeValue (sum of season PPG) → whoBenefitsCopy; % gap = |Left−Right|/min(Left,Right). Not Insights chipValue blend.",
        perPlayerTradeValues: [...trade.sideA, ...trade.sideB].map((c) => ({
          label: c.label,
          tradeValue: c.tradeValue,
          seasonPpg: c.seasonPpg,
        })),
      },
    },
  };

  const outJson = resolve(
    process.cwd(),
    "src/app/ui-preview/chat/live-sample.json",
  );
  writeFileSync(outJson, JSON.stringify(sample, null, 2));
  console.log("Wrote", outJson);

  const docsDir = resolve(process.cwd(), "docs/screenshots");
  mkdirSync(docsDir, { recursive: true });
  const md = [
    `# Chat screenshot number sources (Week ${CURRENT_WEEK}, ${SEASON})`,
    "",
    `Generated: ${sample.generatedAt}`,
    "",
    "All card numbers come from the shared chat tool runners (`runTradeCompare` / `runWhoToStartCompare` → `buildPlayerMetricCard`). No fixture invents PPG, opponent, or trend text.",
    "",
    "## Upstream feeds",
    "",
    `| What | URL / asset |`,
    `| --- | --- |`,
    `| Sleeper full-PPR projections | \`${sample.sources.projections}\` |`,
    `| nflverse week PPR | \`${sample.sources.weekStats}\` (\`fantasy_points_ppr\`) |`,
    `| ESPN week schedule (@/vs) | \`${sample.sources.scoreboard}\` |`,
    "",
    "## Per-player card fields",
    "",
  ];
  for (const s of perPlayerSources) {
    md.push(`### ${s.player}`);
    md.push("");
    md.push(`- **Opponent (this week):** \`${s.opponent.value}\` — ${s.opponent.source}`);
    md.push(
      `- **Points per game this season:** \`${s.seasonPpg.value?.toFixed(1) ?? "—"}\` — mean of nflverse \`fantasy_points_ppr\` weeks: ${s.seasonPpg.weeks.map((w) => `W${w.week}=${w.points}`).join(", ")}`,
    );
    md.push(
      `- **Avg last 3 games:** \`${s.last3Avg.value?.toFixed(1) ?? "—"}\` — mean of latest 3 scored weeks: ${s.last3Avg.weeks.map((w) => `W${w.week}=${w.points}`).join(", ")}`,
    );
    md.push(
      `- **Projected points this week:** \`${s.sleeperProj.value?.toFixed(1) ?? "—"}\` — ${s.sleeperProj.source}`,
    );
    md.push(`- **Trend line:** \`${s.formLine.value}\` — ${s.formLine.source}`);
    md.push("");
  }
  md.push("## Trade verdict");
  md.push("");
  md.push(
    `- **Value basis:** season points per game (sum). Not \`chipValue\` blend.`,
  );
  md.push(
    `- Left package value: **${trade.giveValue.toFixed(1)}** · Right: **${trade.receiveValue.toFixed(1)}**`,
  );
  md.push(
    `- Per-player trade values: ${[...trade.sideA, ...trade.sideB].map((c) => `${c.label}=${c.tradeValue?.toFixed(1)}`).join(", ")}`,
  );
  md.push(
    `- Gap: **${trade.valueGap.toFixed(1)}** · relative **${(trade.pctGap * 100).toFixed(1)}%** vs **lower side** → tier **${trade.tier}** · tone **${trade.tone}**`,
  );
  md.push(`- Headline: ${trade.headline}`);
  md.push(
    `- Freshness: \`${trade.freshness.label}\` (stats through Week ${STATS_THROUGH})`,
  );
  md.push("");
  md.push("## Who to Start");
  md.push("");
  md.push(`- Headline: ${wts.headline}`);
  md.push(`- Edge: ${wts.edge.toFixed(1)}`);
  md.push("");

  const outMd = resolve(docsDir, "CHAT_SCREENSHOT_SOURCES.md");
  writeFileSync(outMd, md.join("\n"));
  console.log("Wrote", outMd);
  console.log("Trade:", trade.headline);
  console.log("WTS:", wts.headline);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
