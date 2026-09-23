/**
 * Waiver Wire Shark — injury → opportunity claims.
 *
 * Mapping rules (situational, not “highest projected FA” alone):
 * 1. Only act on documented injury signals: roster injuryStatus of OUT /
 *    DOUBTFUL / IR, plus ESPN injury/news headlines that clearly mark Out.
 * 2. Beneficiaries prefer (a) curated same-team handcuffs / backups, then
 *    (b) same-NFL-team free agents at the same position (depth-chart next-up).
 * 3. Candidate must be on the league free-agent list (not rostered anywhere).
 * 4. If the handcuff is uncertain (depth-chart inference only), say so.
 * 5. Never invent injuries or invent backups that are not in FA / known map.
 *
 * Classic patterns: star WR out → next WR on that team; QB out → known backup;
 * RB starter out → handcuff.
 */

import type {
  FantasyPlayer,
  FantasyTeam,
  InsightRecommendation,
  InjuryStatus,
  LeagueData,
  PlayerNewsItem,
  PlayerPosition,
} from "@/lib/types";

const ACTIONABLE: InjuryStatus[] = ["OUT", "DOUBTFUL", "IR"];

/** Curated starter → backup names (lowercase). Prefer these over raw depth inference. */
const KNOWN_BACKUPS: Record<string, string[]> = {
  // WR next-man-up
  "puka nacua": ["tutu atwell", "jordan whittington", "demarcus robinson", "tyler johnson"],
  "cee dee lamb": ["jalen tolbert", "brandin cooks", "kavere turpin"],
  "ceedee lamb": ["jalen tolbert", "brandin cooks"],
  "amon-ra st. brown": ["jameson williams", "kalif raymond"],
  "tyreek hill": ["jaylen waddle", "odell beckham"],
  "ja'marr chase": ["tee higgins", "andrei iosivas"],
  // RB handcuffs
  "kyren williams": ["blake corum"],
  "breece hall": ["braelon allen", "israel abanikanda"],
  "jahmyr gibbs": ["david montgomery"],
  "james conner": ["trey benson", "emari demercado"],
  "zack moss": ["chase brown", "khalil herbert"],
  "saquon barkley": ["will shipley", "kenneth gainwell"],
  "derrick henry": ["justice hill"],
  // QB backups
  "josh allen": ["mitchell trubisky", "mike white"],
  "anthony richardson": ["joe flacco", "gardner minshew"],
  "tua tagovailoa": ["tyler huntley", "mike white"],
  "jaxson dart": ["jameis winston", "tommy devito"],
  "jaxon dart": ["jameis winston", "tommy devito"],
  "baker mayfield": ["kyle trask"],
  "bo nix": ["jarrett stidham"],
};

function norm(name: string): string {
  return name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function allRostered(league: LeagueData): FantasyPlayer[] {
  return league.teams.flatMap((t) => t.roster);
}

function availableFas(league: LeagueData): FantasyPlayer[] {
  const owned = new Set(allRostered(league).map((p) => p.espnId));
  return league.freeAgents.filter((fa) => !owned.has(fa.espnId));
}

function collectInjured(
  league: LeagueData,
  news: PlayerNewsItem[],
): { player: FantasyPlayer; source: string }[] {
  const byName = new Map(allRostered(league).map((p) => [norm(p.name), p]));
  const out: { player: FantasyPlayer; source: string }[] = [];
  const seen = new Set<number>();

  for (const p of allRostered(league)) {
    if (!ACTIONABLE.includes(p.injuryStatus)) continue;
    if (seen.has(p.espnId)) continue;
    seen.add(p.espnId);
    out.push({
      player: p,
      source: `roster injury status ${p.injuryStatus}`,
    });
  }

  for (const item of news) {
    const text = `${item.headline} ${item.description ?? ""}`.toLowerCase();
    if (
      !/\b(out|doubtful|ir\b|injured reserve|ruled out|will not play|placed on ir)\b/.test(
        text,
      )
    ) {
      continue;
    }
    for (const name of item.playerNames) {
      const p = byName.get(norm(name));
      if (!p || seen.has(p.espnId)) continue;
      seen.add(p.espnId);
      out.push({
        player: p,
        source: `ESPN news “${item.headline}”`,
      });
    }
  }

  return out;
}

function knownBackupNames(injuredName: string): string[] {
  const key = norm(injuredName);
  if (KNOWN_BACKUPS[key]) return KNOWN_BACKUPS[key];
  for (const [k, v] of Object.entries(KNOWN_BACKUPS)) {
    if (norm(k) === key) return v;
  }
  return [];
}

function findBeneficiaries(
  injured: FantasyPlayer,
  fas: FantasyPlayer[],
): {
  add: FantasyPlayer;
  confidence: "known_handcuff" | "same_team_depth";
  note: string;
}[] {
  const results: {
    add: FantasyPlayer;
    confidence: "known_handcuff" | "same_team_depth";
    note: string;
  }[] = [];

  for (const backupName of knownBackupNames(injured.name)) {
    const match = fas.find((fa) => {
      const n = norm(fa.name);
      return n === backupName || n.includes(backupName) || backupName.includes(n);
    });
    if (!match) continue;
    if (match.position !== injured.position) continue;
    results.push({
      add: match,
      confidence: "known_handcuff",
      note: `${match.name} is a documented ${injured.nflTeam} ${injured.position} backup/handcuff for ${injured.name}.`,
    });
  }

  const sameTeam = fas
    .filter(
      (fa) =>
        fa.nflTeam === injured.nflTeam &&
        fa.position === injured.position &&
        fa.espnId !== injured.espnId &&
        !results.some((r) => r.add.espnId === fa.espnId),
    )
    .sort(
      (a, b) =>
        b.projectedPoints - a.projectedPoints ||
        b.percentOwned - a.percentOwned,
    );

  for (const fa of sameTeam.slice(0, 2)) {
    results.push({
      add: fa,
      confidence: "same_team_depth",
      note: `${fa.name} is the highest-projected ${injured.nflTeam} ${injured.position} on your waiver wire — treated as likely next-up, but depth-chart order is not confirmed from ESPN.`,
    });
  }

  return results;
}

function dropCandidate(
  team: FantasyTeam,
  addPos: PlayerPosition,
): FantasyPlayer | null {
  const bench = team.roster
    .filter((p) => !p.isStarter && p.slot !== "IR")
    .sort((a, b) => {
      const inj = (p: FantasyPlayer) =>
        ACTIONABLE.includes(p.injuryStatus) || p.injuryStatus === "QUESTIONABLE"
          ? 0
          : 1;
      return (
        inj(a) - inj(b) ||
        a.projectedPoints - b.projectedPoints ||
        a.percentOwned - b.percentOwned
      );
    });
  const samePos = bench.find((p) => p.position === addPos);
  return samePos ?? bench[0] ?? null;
}

function roleLabel(injured: FantasyPlayer, add: FantasyPlayer): string {
  if (injured.position === "QB") return "backup QB / emergency starter";
  if (injured.position === "RB") return "RB handcuff / committee lead";
  if (injured.position === "WR") return "elevated WR target share";
  if (injured.position === "TE") return "TE1 opportunity";
  return `${add.position} opportunity`;
}

export function buildWaiverShark(
  league: LeagueData,
  team: FantasyTeam,
  news: PlayerNewsItem[] = [],
): InsightRecommendation[] {
  const fas = availableFas(league);
  if (!fas.length) return [];

  const injured = collectInjured(league, news);
  const out: InsightRecommendation[] = [];
  const seenAdds = new Set<number>();

  for (const { player: hurt, source } of injured) {
    if (!["QB", "RB", "WR", "TE"].includes(hurt.position)) continue;

    for (const { add, confidence, note } of findBeneficiaries(hurt, fas)) {
      if (seenAdds.has(add.espnId)) continue;
      seenAdds.add(add.espnId);

      const drop = dropCandidate(team, add.position);
      const role = roleLabel(hurt, add);

      out.push({
        id: `waiver-${hurt.espnId}-${add.espnId}`,
        type: "waiver",
        priority:
          confidence === "known_handcuff" &&
          (hurt.injuryStatus === "OUT" || hurt.injuryStatus === "IR")
            ? "high"
            : hurt.injuryStatus === "DOUBTFUL"
              ? "medium"
              : "high",
        title: `Add ${add.name} — ${hurt.name} is ${hurt.injuryStatus}`,
        summary: `${hurt.name} is ${hurt.injuryStatus.toLowerCase()}. ${add.name} is the ${role} and still on your waiver wire.`,
        reasoning: [
          `Claim ${add.name} while ${hurt.name} is ${hurt.injuryStatus} — ${add.name} is the ${role} and available in your league.`,
          `${hurt.name} (${hurt.nflTeam} ${hurt.position}) is unavailable — ${source}. We never invent injury news.`,
          note,
          `${add.name} is on waivers (${add.percentOwned.toFixed(0)}% owned league-wide, ${add.projectedPoints.toFixed(1)} projected).`,
          drop
            ? `If your roster is full, consider dropping ${drop.name} (${drop.position}, ${drop.projectedPoints.toFixed(1)} projected${drop.injuryStatus !== "ACTIVE" ? `, ${drop.injuryStatus}` : ""}).`
            : `You appear to have roster space — claim ${add.name} before the wire clears.`,
        ],
        relatedPlayerIds: [hurt.id, add.id, ...(drop ? [drop.id] : [])],
        relatedPositions: [hurt.position, add.position],
      });
    }
  }

  out.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const pr = rank[a.priority] - rank[b.priority];
    if (pr !== 0) return pr;
    return a.title.localeCompare(b.title);
  });

  return out.slice(0, 8);
}
