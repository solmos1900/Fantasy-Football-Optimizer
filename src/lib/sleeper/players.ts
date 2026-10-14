/**
 * Authoritative Sleeper NFL player directory (server-only).
 * Source of team / active / status for the no-league pool.
 */

import { z } from "zod";
import { secureFetchJson } from "@/lib/http/secure-fetch";
import { sleeperNameTeamKey } from "@/lib/sleeper/projections";

const SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";

const SleeperPlayerSchema = z
  .object({
    player_id: z.string().optional(),
    espn_id: z.union([z.string(), z.number(), z.null()]).optional(),
    full_name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    position: z.string().nullish(),
    fantasy_positions: z.array(z.string()).nullish(),
    team: z.string().nullish(),
    status: z.string().nullish(),
    active: z.boolean().nullish(),
    injury_status: z.string().nullish(),
  })
  .passthrough();

const SleeperPlayersDirSchema = z.record(z.string(), SleeperPlayerSchema);

export type SleeperRosterPlayer = {
  sleeperId: string;
  espnId: number | null;
  name: string;
  position: string;
  /** NFL team abbrev when rostered; null when unsigned / no team. */
  team: string | null;
  status: string;
  active: boolean;
  nameTeamKey: string;
};

const SKILL = new Set(["QB", "RB", "WR", "TE"]);

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; byEspn: Map<number, SleeperRosterPlayer>; all: SleeperRosterPlayer[] } | null =
  null;

function normalizeTeam(team: string | null | undefined): string | null {
  const t = (team ?? "").trim().toUpperCase();
  if (!t || t === "FA" || t === "NONE") return null;
  return t;
}

function isActiveStatus(status: string, active: boolean | null | undefined): boolean {
  if (active === false) return false;
  const s = status.trim().toLowerCase();
  if (!s) return active === true;
  if (
    /retir|inactive|cut|waived|unsigned|exempt|suspended|physically unable|non[- ]football/i.test(
      s,
    )
  ) {
    return false;
  }
  // Sleeper uses "Active" for rostered; also allow Injured Reserve etc. when active flag true
  if (active === true) return true;
  return s === "active";
}

/**
 * Load Sleeper /players/nfl skill directory keyed by ESPN id (+ name|team index).
 */
export async function loadSleeperRosterDirectory(options?: {
  forceRefresh?: boolean;
}): Promise<{
  byEspnId: Map<number, SleeperRosterPlayer>;
  byNameTeam: Map<string, SleeperRosterPlayer>;
  allSkill: SleeperRosterPlayer[];
  fetchedAt: string;
}> {
  if (
    !options?.forceRefresh &&
    cache &&
    Date.now() - cache.at < CACHE_TTL_MS
  ) {
    const byNameTeam = new Map<string, SleeperRosterPlayer>();
    for (const p of cache.all) byNameTeam.set(p.nameTeamKey, p);
    return {
      byEspnId: cache.byEspn,
      byNameTeam,
      allSkill: cache.all,
      fetchedAt: new Date(cache.at).toISOString(),
    };
  }

  const raw = await secureFetchJson(
    SLEEPER_PLAYERS_URL,
    SleeperPlayersDirSchema,
    { timeoutMs: 45_000, retries: 2, next: { revalidate: 21600 } },
  );

  const byEspn = new Map<number, SleeperRosterPlayer>();
  const byNameTeam = new Map<string, SleeperRosterPlayer>();
  const all: SleeperRosterPlayer[] = [];

  for (const [sid, row] of Object.entries(raw)) {
    const pos = (row.position ?? row.fantasy_positions?.[0] ?? "")
      .toUpperCase()
      .trim();
    if (!SKILL.has(pos)) continue;

    const name =
      (row.full_name ??
        [row.first_name, row.last_name].filter(Boolean).join(" ")).trim() ||
      sid;
    const espnRaw = Number(row.espn_id);
    const espnId =
      Number.isFinite(espnRaw) && espnRaw > 0 ? espnRaw : null;
    const team = normalizeTeam(row.team);
    const status = (row.status ?? "").trim() || "Unknown";
    const active = isActiveStatus(status, row.active ?? null);
    const entry: SleeperRosterPlayer = {
      sleeperId: sid,
      espnId,
      name,
      position: pos,
      team,
      status,
      active,
      nameTeamKey: sleeperNameTeamKey(name, team),
    };
    all.push(entry);
    if (espnId != null && !byEspn.has(espnId)) byEspn.set(espnId, entry);
    if (!byNameTeam.has(entry.nameTeamKey)) {
      byNameTeam.set(entry.nameTeamKey, entry);
    }
  }

  cache = { at: Date.now(), byEspn, all };
  return {
    byEspnId: byEspn,
    byNameTeam,
    allSkill: all,
    fetchedAt: new Date().toISOString(),
  };
}

/** True when Sleeper says the player is pickable (active + has a team). */
export function sleeperIsPickerEligible(p: SleeperRosterPlayer): boolean {
  return p.active && p.team != null;
}
