/**
 * Sleeper fantasy league connect (public read API — no login or cookies).
 *
 *   GET /v1/user/{username}                       → user_id
 *   GET /v1/user/{user_id}/leagues/nfl/{season}   → leagues
 *   GET /v1/league/{id}  /rosters  /users  /matchups/{week}
 *   GET /v1/state/nfl                             → current week
 *
 * Maps a Sleeper league onto the app's LeagueData (ESPN-id keyed players) so
 * every existing screen and tool works unchanged. Weekly points come from
 * Sleeper matchups, i.e. the league's own scoring; projections use the
 * Sleeper field matching the league's reception scoring (PPR / half / std).
 */

import { z } from "zod";
import { memoTtl } from "@/lib/cache/memo";
import { secureFetch } from "@/lib/http/secure-fetch";
import { normalizeNflAbbrev } from "@/lib/espn/pro-teams";
import {
  formatFromReceptionPoints,
  scoringLabel,
  type ScoringFormat,
} from "@/lib/league/scoring";
import { enrichLeagueWithScoreboard } from "@/lib/espn/client";
import {
  isSyntheticEspnId,
  resolveEspnIdsForSleeperPlayers,
  type SleeperIdentity,
} from "@/lib/sleeper/id-crosswalk";
import type {
  FantasyPlayer,
  FantasyTeam,
  InjuryStatus,
  LeagueData,
  Matchup,
  PlayerPosition,
  WeeklyScore,
} from "@/lib/types";

const API = "https://api.sleeper.app/v1";
const PROJECTIONS_API = "https://api.sleeper.app/projections/nfl";
const SLEEPER_TIMEOUT_MS = 15_000;
const RECENT_WEEKS = 6;
/** Free agents per position (Sleeper has no FA feed; QBs would dominate a single top-N). */
const FREE_AGENTS_PER_POSITION: Record<string, number> = {
  QB: 8,
  RB: 14,
  WR: 14,
  TE: 8,
  K: 3,
  DEF: 3,
};

export class SleeperApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SleeperApiError";
    this.status = status;
  }
}

async function sleeperGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await secureFetch(`${API}${path}`, {
      timeoutMs: SLEEPER_TIMEOUT_MS,
      retries: 1,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new SleeperApiError("Could not reach Sleeper. Try again in a minute.", 504);
  }
  if (!res.ok) {
    throw new SleeperApiError(`Sleeper API error ${res.status}`, res.status);
  }
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new SleeperApiError("Sleeper returned data in an unexpected shape.", 502);
  }
  return parsed.data;
}

// ── Schemas (only the fields we use) ──────────────────────────────────────

const UserSchema = z
  .object({ user_id: z.string(), username: z.string().nullish(), display_name: z.string().nullish() })
  .nullable();

const LeagueSchema = z.object({
  league_id: z.string(),
  name: z.string().nullish(),
  season: z.string(),
  status: z.string().nullish(),
  total_rosters: z.number().nullish(),
  roster_positions: z.array(z.string()).nullish(),
  scoring_settings: z.record(z.string(), z.number().nullable()).nullish(),
});
export type SleeperLeagueSummary = z.infer<typeof LeagueSchema>;

const RosterSchema = z.object({
  roster_id: z.number(),
  owner_id: z.string().nullish(),
  co_owners: z.array(z.string()).nullish(),
  players: z.array(z.string()).nullish(),
  starters: z.array(z.string()).nullish(),
  reserve: z.array(z.string()).nullish(),
  taxi: z.array(z.string()).nullish(),
  settings: z
    .object({
      wins: z.number().nullish(),
      losses: z.number().nullish(),
      ties: z.number().nullish(),
      fpts: z.number().nullish(),
      fpts_decimal: z.number().nullish(),
      fpts_against: z.number().nullish(),
      fpts_against_decimal: z.number().nullish(),
    })
    .passthrough()
    .nullish(),
});

const LeagueUserSchema = z.object({
  user_id: z.string(),
  display_name: z.string().nullish(),
  metadata: z.object({ team_name: z.string().nullish() }).passthrough().nullish(),
});

const MatchupSchema = z.object({
  roster_id: z.number(),
  matchup_id: z.number().nullish(),
  points: z.number().nullish(),
  players_points: z.record(z.string(), z.number()).nullish(),
});

const StateSchema = z.object({
  week: z.number(),
  season: z.string(),
  season_type: z.string().nullish(),
});

const DirectoryPlayerSchema = z
  .object({
    player_id: z.string().nullish(),
    espn_id: z.union([z.string(), z.number()]).nullish(),
    full_name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    position: z.string().nullish(),
    team: z.string().nullish(),
    active: z.boolean().nullish(),
    injury_status: z.string().nullish(),
  })
  .passthrough();
type DirectoryPlayer = z.infer<typeof DirectoryPlayerSchema>;

// ── Public lookups ────────────────────────────────────────────────────────

export async function fetchSleeperUser(
  username: string,
): Promise<{ userId: string; displayName: string } | null> {
  const name = username.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(name)) return null;
  const user = await sleeperGet(`/user/${encodeURIComponent(name)}`, UserSchema);
  if (!user) return null;
  return { userId: user.user_id, displayName: user.display_name ?? user.username ?? name };
}

export async function fetchSleeperUserLeagues(
  userId: string,
  season: number,
): Promise<SleeperLeagueSummary[]> {
  return sleeperGet(
    `/user/${encodeURIComponent(userId)}/leagues/nfl/${season}`,
    z.array(LeagueSchema).nullable(),
  ).then((l) => l ?? []);
}

export async function fetchSleeperNflState(): Promise<z.infer<typeof StateSchema>> {
  return memoTtl("sleeper-state", 5 * 60_000, () => sleeperGet("/state/nfl", StateSchema));
}

/** Full Sleeper player directory (~5 MB). Cached per instance for 6 hours. */
function loadSleeperDirectory(): Promise<Record<string, DirectoryPlayer>> {
  return memoTtl("sleeper-directory-full", 6 * 60 * 60_000, async () => {
    const res = await secureFetch(`${API}/players/nfl`, {
      timeoutMs: 45_000,
      retries: 1,
      cache: "no-store",
    });
    if (!res.ok) throw new SleeperApiError(`Sleeper players ${res.status}`, res.status);
    const raw = (await res.json()) as Record<string, unknown>;
    const out: Record<string, DirectoryPlayer> = {};
    for (const [id, value] of Object.entries(raw)) {
      const p = DirectoryPlayerSchema.safeParse(value);
      if (p.success) out[id] = p.data;
    }
    return out;
  });
}

// ── Scoring ───────────────────────────────────────────────────────────────

export type SleeperScoringFormat = ScoringFormat;

export function scoringFormatFromSettings(
  scoring: Record<string, number | null> | null | undefined,
): SleeperScoringFormat {
  return formatFromReceptionPoints(scoring?.rec);
}

/** Human label, e.g. "Half PPR · Superflex · TE premium". */
export function sleeperScoringLabel(
  scoring: Record<string, number | null> | null | undefined,
  rosterPositions: string[] | null | undefined,
): string {
  return scoringLabel(
    scoringFormatFromSettings(scoring),
    (rosterPositions ?? []).includes("SUPER_FLEX"),
    Number(scoring?.bonus_rec_te ?? 0) > 0 ? ["TE premium"] : [],
  );
}

/** Read exactly one projection field for the league's format — no fallbacks. */
export function projectionForFormat(
  stats: Record<string, unknown> | null | undefined,
  format: SleeperScoringFormat,
): number | null {
  const field = { ppr: "pts_ppr", half_ppr: "pts_half_ppr", std: "pts_std" }[format];
  const v = stats?.[field];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

async function fetchProjectionsBySleeperId(
  season: number,
  week: number,
  format: SleeperScoringFormat,
): Promise<Map<string, number>> {
  const raw = await memoTtl(`sleeper-proj-raw:${season}:${week}`, 10 * 60_000, async () => {
    const qs = ["QB", "RB", "WR", "TE", "K", "DEF"]
      .map((p) => `position[]=${p}`)
      .join("&");
    const res = await secureFetch(
      `${PROJECTIONS_API}/${season}/${week}?season_type=regular&${qs}`,
      { timeoutMs: 30_000, retries: 1, cache: "no-store" },
    );
    if (!res.ok) throw new SleeperApiError(`Sleeper projections ${res.status}`, res.status);
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new SleeperApiError("Sleeper projections empty", 502);
    }
    return rows as { player_id?: string; stats?: Record<string, unknown> }[];
  }).catch(() => [] as { player_id?: string; stats?: Record<string, unknown> }[]);

  const out = new Map<string, number>();
  for (const row of raw) {
    const pts = projectionForFormat(row.stats, format);
    if (row.player_id && pts != null) out.set(row.player_id, pts);
  }
  return out;
}

// ── Mapping helpers ───────────────────────────────────────────────────────

const POSITION_MAP: Record<string, PlayerPosition> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DEF: "D/ST",
};

function mapInjury(raw: string | null | undefined): InjuryStatus {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "ACTIVE";
  if (s.startsWith("ques")) return "QUESTIONABLE";
  if (s.startsWith("doub")) return "DOUBTFUL";
  if (s === "out") return "OUT";
  if (s === "ir" || s.includes("injured reserve")) return "IR";
  if (s === "pup") return "PUP";
  if (s.startsWith("sus")) return "SUSPENSION";
  if (s === "na" || s === "dnr" || s === "cov") return "OUT";
  return "ACTIVE";
}

function slotForStarterIndex(
  rosterPositions: string[],
  index: number,
): FantasyPlayer["slot"] {
  const starterSlots = rosterPositions.filter((p) => p !== "BN");
  const pos = starterSlots[index];
  if (!pos) return "FLEX";
  if (pos === "DEF") return "D/ST";
  if (pos in POSITION_MAP) return POSITION_MAP[pos];
  return "FLEX"; // FLEX / SUPER_FLEX / REC_FLEX / WRRB_FLEX / IDP slots
}

function displayName(p: DirectoryPlayer | undefined, sleeperId: string): string {
  if (!p) return sleeperId;
  if (p.position === "DEF") {
    return `${p.last_name ?? p.team ?? sleeperId} D/ST`;
  }
  return (
    p.full_name ??
    ([p.first_name, p.last_name].filter(Boolean).join(" ") || sleeperId)
  );
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return letters.slice(0, 4) || "TM";
}

// ── League fetch ──────────────────────────────────────────────────────────

export type SleeperLeagueInput = {
  leagueId: string;
  /** Sleeper user_id of the app user — picks their roster. */
  sleeperUserId?: string | null;
  /** Explicit roster_id override (rarely needed). */
  rosterId?: number | null;
};

export async function fetchSleeperLeague(
  input: SleeperLeagueInput,
): Promise<LeagueData & { scoringLabel: string; platform: "sleeper" }> {
  const leagueId = input.leagueId.trim();
  if (!/^\d{6,25}$/.test(leagueId)) {
    throw new SleeperApiError("That doesn't look like a Sleeper league ID.", 400);
  }

  const [league, rosters, users, state, directory] = await Promise.all([
    sleeperGet(`/league/${leagueId}`, LeagueSchema.nullable()),
    sleeperGet(`/league/${leagueId}/rosters`, z.array(RosterSchema)),
    sleeperGet(`/league/${leagueId}/users`, z.array(LeagueUserSchema)),
    fetchSleeperNflState(),
    loadSleeperDirectory(),
  ]);
  if (!league) throw new SleeperApiError("Sleeper league not found.", 404);

  const season = Number(league.season);
  // Sleeper's NFL state week is the in-progress (or upcoming) week.
  const currentWeek =
    state.season === league.season ? Math.max(1, state.week) : 1;
  const format = scoringFormatFromSettings(league.scoring_settings);
  const rosterPositions = league.roster_positions ?? [];

  const firstWeek = Math.max(1, currentWeek - RECENT_WEEKS);
  const weeks = Array.from(
    { length: currentWeek - firstWeek + 1 },
    (_, i) => firstWeek + i,
  );
  const [weekMatchups, projections] = await Promise.all([
    Promise.all(
      weeks.map((w) =>
        sleeperGet(`/league/${leagueId}/matchups/${w}`, z.array(MatchupSchema))
          .then((m) => ({ week: w, matchups: m }))
          .catch(() => ({ week: w, matchups: [] as z.infer<typeof MatchupSchema>[] })),
      ),
    ),
    fetchProjectionsBySleeperId(season, currentWeek, format),
  ]);

  // sleeperId → week → league-scored points (only weeks it was rostered)
  const pointsByPlayer = new Map<string, Map<number, number>>();
  for (const { week, matchups } of weekMatchups) {
    for (const m of matchups) {
      for (const [pid, pts] of Object.entries(m.players_points ?? {})) {
        if (!pointsByPlayer.has(pid)) pointsByPlayer.set(pid, new Map());
        pointsByPlayer.get(pid)!.set(week, Math.round(pts * 100) / 100);
      }
    }
  }

  // Free agents: unrostered active players with this week's best projections.
  const rostered = new Set(rosters.flatMap((r) => r.players ?? []));
  const faCandidates = [...projections.entries()]
    .filter(([pid]) => {
      const d = directory[pid];
      return !rostered.has(pid) && d?.position && d.position in POSITION_MAP && (d.team || d.position === "DEF");
    })
    .sort((a, b) => b[1] - a[1]);
  const faIds = Object.entries(FREE_AGENTS_PER_POSITION).flatMap(([pos, n]) =>
    faCandidates
      .filter(([pid]) => directory[pid]?.position === pos)
      .slice(0, n)
      .map(([pid]) => pid),
  );

  const allIds = [...new Set([...rostered, ...faIds])];
  const identities: SleeperIdentity[] = allIds.map((sid) => {
    const d = directory[sid];
    const espnRaw = d?.espn_id != null ? Number(d.espn_id) : null;
    return {
      sleeperId: sid,
      espnId: Number.isInteger(espnRaw) ? espnRaw : null,
      name: displayName(d, sid),
      position: d?.position ?? (/^[A-Z]{2,3}$/.test(sid) ? "DEF" : ""),
      team: d?.team ?? (/^[A-Z]{2,3}$/.test(sid) ? sid : null),
    };
  });
  const ids = await resolveEspnIdsForSleeperPlayers(identities);

  function toPlayer(sid: string, slot: FantasyPlayer["slot"]): FantasyPlayer {
    const d = directory[sid];
    const espnId = ids.get(sid)?.espnId ?? 0;
    const weekly = pointsByPlayer.get(sid);
    const recentWeeks: WeeklyScore[] = weeks
      .filter((w) => w < currentWeek)
      .map((w) => ({ week: w, points: weekly?.get(w) ?? null }))
      .filter((w) => w.points != null)
      .sort((a, b) => b.week - a.week);
    const position: PlayerPosition =
      POSITION_MAP[d?.position ?? ""] ?? (/^[A-Z]{2,3}$/.test(sid) ? "D/ST" : "WR");
    return {
      id: isSyntheticEspnId(espnId) ? `sleeper-${sid}` : `espn-${espnId}`,
      espnId,
      name: displayName(d, sid),
      position,
      nflTeam:
        normalizeNflAbbrev(d?.team ?? (position === "D/ST" ? sid : null)) ?? "FA",
      injuryStatus: mapInjury(d?.injury_status),
      projectedPoints: projections.get(sid) ?? null,
      actualPoints: weekly?.get(currentWeek) ?? null,
      // Sleeper's public API has no league-wide ownership figures.
      percentOwned: 0,
      percentStarted: 0,
      slot,
      isStarter: slot !== "BN" && slot !== "IR",
      recentWeeks: recentWeeks.length ? recentWeeks : undefined,
    };
  }

  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const teams: FantasyTeam[] = rosters.map((r) => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
    const ownerName = owner?.display_name ?? "Open team";
    const name = owner?.metadata?.team_name?.trim() || ownerName;
    const starters = (r.starters ?? []).map((sid, i) => ({ sid, slot: slotForStarterIndex(rosterPositions, i) }));
    const starterSet = new Set(starters.map((s) => s.sid));
    const reserve = new Set(r.reserve ?? []);
    const roster: FantasyPlayer[] = [
      ...starters
        .filter((s) => s.sid && s.sid !== "0")
        .map((s) => toPlayer(s.sid, s.slot)),
      ...(r.players ?? [])
        .filter((sid) => !starterSet.has(sid))
        .map((sid) => toPlayer(sid, reserve.has(sid) ? "IR" : "BN")),
    ];
    const s = r.settings ?? {};
    return {
      id: r.roster_id,
      name,
      abbrev: initials(name),
      ownerName,
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      pointsFor: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
      pointsAgainst: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
      standing: 0,
      roster,
      isCurrentUser: false,
    };
  });

  // Standings: wins, then points for (Sleeper's default tiebreak).
  const ranked = [...teams].sort(
    (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor,
  );
  ranked.forEach((t, i) => (t.standing = i + 1));

  const userRoster =
    input.rosterId != null
      ? rosters.find((r) => r.roster_id === input.rosterId)
      : input.sleeperUserId
        ? rosters.find(
            (r) =>
              r.owner_id === input.sleeperUserId ||
              (r.co_owners ?? []).includes(input.sleeperUserId!),
          )
        : undefined;
  const userTeamId = userRoster?.roster_id;
  for (const t of teams) t.isCurrentUser = t.id === userTeamId;

  const current = weekMatchups.find((w) => w.week === currentWeek)?.matchups ?? [];
  const projectedTotal = (rosterId: number) =>
    teams
      .find((t) => t.id === rosterId)
      ?.roster.filter((p) => p.isStarter)
      .reduce((sum, p) => sum + (p.projectedPoints ?? 0), 0) ?? 0;
  const pairs = new Map<number, z.infer<typeof MatchupSchema>[]>();
  for (const m of current) {
    if (m.matchup_id == null) continue;
    pairs.set(m.matchup_id, [...(pairs.get(m.matchup_id) ?? []), m]);
  }
  const matchups: Matchup[] = [...pairs.entries()]
    .filter(([, pair]) => pair.length === 2)
    .map(([id, [home, away]]) => ({
      id,
      week: currentWeek,
      homeTeamId: home.roster_id,
      awayTeamId: away.roster_id,
      homeScore: home.points ?? 0,
      awayScore: away.points ?? 0,
      homeProjected: Math.round(projectedTotal(home.roster_id) * 10) / 10,
      awayProjected: Math.round(projectedTotal(away.roster_id) * 10) / 10,
      isLive: true,
    }));

  const base: LeagueData = {
    leagueId,
    season,
    name: league.name ?? `Sleeper league ${leagueId}`,
    currentWeek,
    scoringPeriodId: currentWeek,
    isDemo: false,
    teams: ranked,
    matchups,
    freeAgents: faIds.map((sid) => toPlayer(sid, "BN")).map((p) => ({ ...p, slot: undefined, isStarter: false })),
    lastSyncedAt: new Date().toISOString(),
    userTeamId,
  };

  const enriched = dropByeWeekZeros(await enrichLeagueWithScoreboard(base));
  return {
    ...enriched,
    platform: "sleeper",
    scoringLabel: sleeperScoringLabel(league.scoring_settings, rosterPositions),
    scoringFormat: format,
    superflex: rosterPositions.includes("SUPER_FLEX"),
  };
}

/**
 * Sleeper records 0 points for rostered players whose team was on bye. The
 * app never shows a fake 0 for a bye (ACCURACY_RULES #7), so a completed week
 * with 0 points and no game on the NFL scoreboard is dropped (UI shows —).
 */
export function dropByeWeekZeros(league: LeagueData): LeagueData {
  const fix = (p: FantasyPlayer): FantasyPlayer => {
    if (!p.recentWeeks?.length) return p;
    const kept = p.recentWeeks.filter((w) => !(w.points === 0 && !w.opponent));
    return kept.length === p.recentWeeks.length
      ? p
      : { ...p, recentWeeks: kept.length ? kept : undefined };
  };
  return {
    ...league,
    teams: league.teams.map((t) => ({ ...t, roster: t.roster.map(fix) })),
    freeAgents: league.freeAgents.map(fix),
  };
}
