import type { FantasyPlayer, PlayerNewsItem } from "@/lib/types";

// Re-export name used by call sites that expect PlayerNewsItem
export type { PlayerNewsItem };

const ESPN_NEWS =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news";
const ESPN_INJURIES =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";

/**
 * Fetch recent public NFL news/injury headlines from ESPN (no API key).
 * Never invents injuries — only returns items ESPN actually published.
 */
export async function fetchEspnPlayerNews(
  players: FantasyPlayer[],
  limit = 8,
): Promise<PlayerNewsItem[]> {
  const names = new Set(
    players.map((p) => p.name.toLowerCase()).filter(Boolean),
  );
  const teamAbbrevs = new Set(
    players
      .map((p) => p.nflTeam.toUpperCase())
      .filter((t) => t && !t.startsWith("T") && t !== "FA"),
  );

  const items: PlayerNewsItem[] = [];

  try {
    const res = await fetch(`${ESPN_NEWS}?limit=50`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const raw = (await res.json()) as {
        articles?: Array<{
          headline?: string;
          description?: string;
          published?: string;
          links?: { web?: { href?: string } };
        }>;
      };

      for (const article of raw.articles ?? []) {
        const headline = article.headline?.trim();
        if (!headline) continue;
        const href = article.links?.web?.href;
        if (!href) continue;

        const haystack = `${headline} ${article.description ?? ""}`.toLowerCase();
        const matchedNames = [...names].filter((n) => haystack.includes(n));
        const mentionsTeam = [...teamAbbrevs].some((t) =>
          haystack.includes(t.toLowerCase()),
        );

        if (!matchedNames.length && !mentionsTeam) continue;

        items.push({
          id: `news-${href}`,
          headline,
          description: article.description?.slice(0, 220),
          url: href,
          source: "ESPN",
          publishedAt: article.published,
          playerNames: matchedNames.map(
            (n) => players.find((p) => p.name.toLowerCase() === n)?.name ?? n,
          ),
        });
      }
    }
  } catch {
    // fall through — injuries endpoint may still work
  }

  try {
    const res = await fetch(ESPN_INJURIES, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const raw = (await res.json()) as {
        injuries?: Array<{
          displayName?: string;
          injuries?: Array<{
            longComment?: string;
            shortComment?: string;
            status?: string;
            date?: string;
            athlete?: { displayName?: string };
            details?: { type?: string; detail?: string };
          }>;
        }>;
      };

      for (const teamBlock of raw.injuries ?? []) {
        for (const injury of teamBlock.injuries ?? []) {
          const athleteName =
            injury.athlete?.displayName ?? teamBlock.displayName ?? "";
          if (!athleteName) continue;
          const match = players.find(
            (p) => p.name.toLowerCase() === athleteName.toLowerCase(),
          );
          if (!match) continue;

          const status = injury.status ?? injury.details?.type ?? "Injury";
          const comment =
            injury.shortComment ??
            injury.longComment ??
            injury.details?.detail ??
            "";
          const headline = `${athleteName}: ${status}${comment ? ` — ${comment}` : ""}`.slice(
            0,
            160,
          );

          items.push({
            id: `inj-${match.espnId}-${status}-${injury.date ?? ""}`,
            headline,
            description: injury.longComment?.slice(0, 220),
            url: "https://www.espn.com/nfl/injuries",
            source: "ESPN Injuries",
            publishedAt: injury.date,
            playerNames: [match.name],
          });
        }
      }
    }
  } catch {
    // ignore — caller shows empty state
  }

  const seen = new Set<string>();
  const unique: PlayerNewsItem[] = [];
  for (const item of items) {
    const key = item.headline.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

/** Demo-safe news cards derived only from known injuryStatus on roster (no invented details). */
export function newsFromRosterInjuries(players: FantasyPlayer[]): PlayerNewsItem[] {
  return players
    .filter((p) => p.injuryStatus !== "ACTIVE" && p.injuryStatus !== "UNKNOWN")
    .map((p) => ({
      id: `roster-inj-${p.id}`,
      headline: `${p.name} listed as ${p.injuryStatus}`,
      description: `Status from your league roster sync (${p.nflTeam}). Open ESPN for the latest report — Gridiron IQ does not invent injury details.`,
      url: `https://www.espn.com/nfl/player/_/id/${Math.abs(p.espnId)}`,
      source: "League roster",
      playerNames: [p.name],
    }));
}
