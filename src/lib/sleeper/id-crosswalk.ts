/**
 * Sleeper player_id → ESPN player id, so Sleeper league players plug into the
 * app's ESPN-id keyed data (nflverse stats, trends, tools).
 *
 * Sleeper's own `espn_id` covers only ~25% of active players, so we combine:
 *   1. Sleeper directory `espn_id`
 *   2. Player.sleeperId already stored in our DB (roster authority)
 *   3. DynastyProcess db_playerids.csv (open player-ID map; GPL-3 repo —
 *      fetched at runtime, not redistributed)
 *   4. Normalized full name + NFL team against our Player table
 *   5. Team defenses → ESPN D/ST ids (-16000 - proTeamId)
 * Anything left gets a synthetic id (SYNTHETIC_ESPN_ID_BASE + sleeper id) so
 * it still renders; synthetic ids never collide with real ESPN ids.
 */

import { prisma } from "@/lib/db";
import { memoTtl } from "@/lib/cache/memo";
import { secureFetchText } from "@/lib/http/secure-fetch";
import { parseCsv } from "@/lib/nflverse/csv";
import {
  ESPN_PRO_TEAM_ABBREV,
  normalizeNflAbbrev,
} from "@/lib/espn/pro-teams";
import { normalizeSleeperPlayerName } from "@/lib/sleeper/projections";

export const DYNASTYPROCESS_IDS_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

/** Above every real ESPN player id, below Postgres INT max (2,147,483,647). */
export const SYNTHETIC_ESPN_ID_BASE = 1_900_000_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isSyntheticEspnId(espnId: number): boolean {
  return espnId >= SYNTHETIC_ESPN_ID_BASE;
}

/** ESPN D/ST id for an NFL team abbreviation, e.g. NE → -16017. */
export function espnDefenseIdForTeam(team: string | null | undefined): number | null {
  const abbrev = normalizeNflAbbrev(team);
  if (!abbrev || abbrev === "FA") return null;
  for (const [id, a] of Object.entries(ESPN_PRO_TEAM_ABBREV)) {
    if (a === abbrev && Number(id) > 0) return -(16000 + Number(id));
  }
  return null;
}

export function syntheticEspnId(sleeperId: string): number {
  const n = Number(sleeperId);
  if (Number.isInteger(n) && n >= 0 && n < 200_000_000) {
    return SYNTHETIC_ESPN_ID_BASE + n;
  }
  // Non-numeric ids (rare): stable small hash inside the synthetic range.
  let h = 0;
  for (const ch of sleeperId) h = (h * 31 + ch.charCodeAt(0)) % 200_000_000;
  return SYNTHETIC_ESPN_ID_BASE + h;
}

/** sleeper_id → espn_id from the DynastyProcess map (cached per instance, 24h). */
export function loadDynastyProcessSleeperToEspn(): Promise<Map<string, number>> {
  return memoTtl("dynastyprocess-ids", DAY_MS, async () => {
    const text = await secureFetchText(DYNASTYPROCESS_IDS_URL, {
      timeoutMs: 30_000,
      retries: 1,
    });
    const map = new Map<string, number>();
    for (const row of parseCsv(text)) {
      const sid = (row.sleeper_id ?? "").trim();
      const espn = Number((row.espn_id ?? "").trim());
      if (sid && sid !== "NA" && Number.isInteger(espn) && espn > 0) {
        map.set(sid, espn);
      }
    }
    if (map.size === 0) throw new Error("DynastyProcess id map empty");
    return map;
  });
}

export type SleeperIdentity = {
  sleeperId: string;
  /** Sleeper directory espn_id, if any */
  espnId?: number | null;
  name: string;
  position: string;
  team: string | null;
};

export type ResolvedEspnId = {
  espnId: number;
  source: "sleeper" | "db" | "dynastyprocess" | "name" | "defense" | "synthetic";
};

export async function resolveEspnIdsForSleeperPlayers(
  players: SleeperIdentity[],
): Promise<Map<string, ResolvedEspnId>> {
  const out = new Map<string, ResolvedEspnId>();
  const pending: SleeperIdentity[] = [];

  for (const p of players) {
    if (p.position === "DEF") {
      const id = espnDefenseIdForTeam(p.team ?? p.sleeperId);
      out.set(
        p.sleeperId,
        id != null
          ? { espnId: id, source: "defense" }
          : { espnId: syntheticEspnId(p.sleeperId), source: "synthetic" },
      );
    } else if (p.espnId != null && p.espnId > 0) {
      out.set(p.sleeperId, { espnId: p.espnId, source: "sleeper" });
    } else {
      pending.push(p);
    }
  }
  if (!pending.length) return out;

  // 2. Stored Player.sleeperId
  const stored = await prisma.player
    .findMany({
      where: { sleeperId: { in: pending.map((p) => p.sleeperId) } },
      select: { sleeperId: true, espnId: true },
    })
    .catch(() => []);
  const bySleeper = new Map(stored.map((r) => [r.sleeperId!, r.espnId]));

  // 3. DynastyProcess map (best effort)
  const dp = await loadDynastyProcessSleeperToEspn().catch((err) => {
    console.error("[sleeper] DynastyProcess id map unavailable", err);
    return new Map<string, number>();
  });

  const stillPending: SleeperIdentity[] = [];
  for (const p of pending) {
    const db = bySleeper.get(p.sleeperId);
    if (db != null) {
      out.set(p.sleeperId, { espnId: db, source: "db" });
      continue;
    }
    const mapped = dp.get(p.sleeperId);
    if (mapped != null) {
      out.set(p.sleeperId, { espnId: mapped, source: "dynastyprocess" });
      continue;
    }
    stillPending.push(p);
  }
  if (!stillPending.length) return out;

  // 4. Name + team against our Player table
  const nameRows = await prisma.player
    .findMany({
      where: {
        position: { in: [...new Set(stillPending.map((p) => p.position))] },
      },
      select: { espnId: true, name: true, nflTeam: true, position: true },
    })
    .catch(() => []);
  const byNameTeam = new Map<string, number>();
  for (const r of nameRows) {
    byNameTeam.set(
      `${normalizeSleeperPlayerName(r.name)}|${normalizeNflAbbrev(r.nflTeam) ?? ""}|${r.position}`,
      r.espnId,
    );
  }
  for (const p of stillPending) {
    const key = `${normalizeSleeperPlayerName(p.name)}|${normalizeNflAbbrev(p.team) ?? ""}|${p.position}`;
    const hit = byNameTeam.get(key);
    out.set(
      p.sleeperId,
      hit != null
        ? { espnId: hit, source: "name" }
        : { espnId: syntheticEspnId(p.sleeperId), source: "synthetic" },
    );
  }
  return out;
}
