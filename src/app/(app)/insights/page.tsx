import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import {
  buildInsightsBundle,
  leaguePositionalAverages,
} from "@/lib/insights/engine";
import {
  fetchEspnPlayerNews,
  newsFromRosterInjuries,
} from "@/lib/espn/news";
import {
  computeTrendsFromLeague,
  enrichPlayersWithSnapshots,
  loadTrendMap,
  refreshProjectionTrends,
} from "@/lib/insights/trends";
import {
  InsightRichText,
  PlayerChip,
} from "@/components/insight-rich-text";
import { PositionChip } from "@/components/position-chip";
import { PendingLink } from "@/components/pending-link";
import { EmptyLeagueConnect } from "@/components/empty-league-connect";
import { StartSitBoard } from "@/components/start-sit-board";
import { cn, priorityColor } from "@/lib/utils";
import type { InsightRecommendation, InsightType } from "@/lib/types";

const TYPE_LABEL: Record<InsightType, string> = {
  start_sit: "Start / Sit",
  trade: "Trade idea",
  news: "News",
  matchup_note: "Matchup note",
  drop_add: "Drop / Add",
  weak_position: "Roster gap",
  mismatch: "Matchup edge",
  streaming: "Stream",
  waiver: "Waiver pickup",
};

function namesForInsight(
  insight: InsightRecommendation,
  nameById?: Map<string, string>,
): string[] {
  const names: string[] = [];
  for (const pid of insight.relatedPlayerIds ?? []) {
    const n = nameById?.get(pid);
    if (n) names.push(n);
  }
  for (const p of insight.trade?.give ?? []) names.push(p.name);
  for (const p of insight.trade?.receive ?? []) names.push(p.name);
  for (const p of insight.trade?.alternativeSendables ?? []) names.push(p.name);
  return [...new Set(names)];
}

function InsightCard({
  insight,
  nameById,
}: {
  insight: InsightRecommendation;
  nameById?: Map<string, string>;
}) {
  const names = namesForInsight(insight, nameById);
  const why = insight.reasoning[0];
  const extraReasons = insight.reasoning.slice(1, 3);

  return (
    <article
      className={cn(
        "surface-card border-l-4 py-4 pl-4 pr-4",
        priorityColor(insight.priority),
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-emerald-950/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/70">
          {TYPE_LABEL[insight.type] ?? insight.type.replaceAll("_", " ")}
        </span>
        {insight.verdict ? (
          <span
            className={cn(
              "stamp animate-stamp text-xs",
              insight.verdict === "START" ? "stamp-start" : "stamp-sit",
            )}
          >
            ★ {insight.verdict}
          </span>
        ) : insight.priority === "high" ? (
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-800">
            Do this week
          </span>
        ) : null}
      </div>

      {names.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {names.slice(0, 4).map((n, i) => (
            <PlayerChip
              key={n}
              name={n}
              tone={i === 0 ? "primary" : "secondary"}
            />
          ))}
        </div>
      )}

      <h3 className="mt-2 text-lg font-semibold leading-snug text-emerald-950">
        <InsightRichText text={insight.title} names={names} emphasize />
      </h3>
      <p className="mt-1.5 text-sm">
        <InsightRichText text={insight.summary} names={names} />
      </p>

      {why && (
        <div className="mt-3 rounded-lg border border-emerald-950/12 border-l-4 border-l-orange-600 bg-[color-mix(in_srgb,var(--kraft)_55%,var(--surface))] px-3 py-2.5">
          <p className="type-eyebrow text-orange-700">Why we chose this</p>
          <p className="mt-1.5">
            <InsightRichText text={why} names={names} emphasize />
          </p>
        </div>
      )}

      {insight.trade && (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
              You give
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {insight.trade.give.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5">
                  <PlayerChip name={p.name} />
                  <PositionChip position={p.position} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
              Why it helps you
            </p>
            <ul className="mt-1 space-y-1">
              {insight.trade.whyYou.map((r) => (
                <li key={r} className="flex gap-2 text-emerald-950/80">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-600" />
                  <InsightRichText text={r} names={names} />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
              You get from {insight.trade.partnerTeamName}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {insight.trade.receive.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5">
                  <PlayerChip name={p.name} tone="secondary" />
                  <PositionChip position={p.position} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
              Why it helps them
            </p>
            <ul className="mt-1 space-y-1">
              {insight.trade.whyThem.map((r) => (
                <li key={r} className="flex gap-2 text-emerald-950/80">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-500" />
                  <InsightRichText text={r} names={names} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {insight.trade?.alternativeSendables &&
        insight.trade.alternativeSendables.length > 0 && (
          <p className="mt-2 text-xs text-emerald-950/55">
            Other players you could offer instead:{" "}
            {insight.trade.alternativeSendables.map((p, i) => (
              <span key={p.id}>
                {i > 0 ? ", " : ""}
                <PlayerChip name={p.name} tone="secondary" className="mx-0.5" />
              </span>
            ))}
          </p>
        )}

      {extraReasons.length > 0 && (
        <details className="mt-3 border-t border-emerald-950/10 pt-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-emerald-950/45 hover:text-emerald-950/70">
            More detail
          </summary>
          <ul className="mt-2 space-y-1.5">
            {extraReasons.map((reason) => (
              <li
                key={reason}
                className="flex gap-2 text-sm leading-relaxed text-emerald-950/70"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-500" />
                <InsightRichText text={reason} names={names} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {insight.newsUrl && (
        <a
          href={insight.newsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-sm font-semibold text-orange-700 hover:text-orange-800"
        >
          {insight.source ?? "Read source"} →
        </a>
      )}
    </article>
  );
}

function Section({
  title,
  description,
  items,
  empty,
  nameById,
  limit = 4,
}: {
  title: string;
  description: string;
  items: InsightRecommendation[];
  empty: string;
  nameById?: Map<string, string>;
  limit?: number;
}) {
  const shown = items.slice(0, limit);
  return (
    <section className="space-y-4">
      <div className="surface-card px-4 py-3 sm:px-5">
        <h2 className="type-section text-emerald-950">{title}</h2>
        <p className="type-caption mt-1 text-emerald-950/55">{description}</p>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-emerald-950/10 bg-[color-mix(in_srgb,var(--kraft)_40%,var(--surface))] px-4 py-3 text-sm text-emerald-950/50">
          {empty}
        </p>
      ) : (
        shown.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            nameById={nameById}
          />
        ))
      )}
      {items.length > limit && (
        <p className="type-caption text-emerald-950/45">
          Showing top {limit} of {items.length} — highest-priority calls first.
        </p>
      )}
    </section>
  );
}

export default async function InsightsPage() {
  const session = await auth();
  const rawLeague = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!rawLeague) {
    return (
      <EmptyLeagueConnect
        title="Insights"
        message="Load a demo league or connect ESPN to unlock start/sit, trades, waivers, news, and defense matchup history."
      />
    );
  }

  try {
    await refreshProjectionTrends(rawLeague);
  } catch {
    // best-effort
  }

  let trendMap = await loadTrendMap(rawLeague);
  if (trendMap.size === 0) {
    trendMap = computeTrendsFromLeague(rawLeague);
  }
  const league = enrichPlayersWithSnapshots(rawLeague, trendMap);

  const rosterPlayers = league.teams.flatMap((t) => t.roster);
  let newsItems = await fetchEspnPlayerNews(rosterPlayers, 8);
  if (!newsItems.length) {
    newsItems = newsFromRosterInjuries(rosterPlayers);
  }

  const bundle = buildInsightsBundle(league, newsItems, trendMap);
  const averages = leaguePositionalAverages(league);

  const nameById = new Map<string, string>();
  for (const p of [...rosterPlayers, ...league.freeAgents]) {
    nameById.set(p.id, p.name);
  }

  const you =
    league.teams.find((t) => t.isCurrentUser) ?? league.teams[0] ?? null;

  const trendsRecord: Record<string, import("@/lib/types").PlayerTrendView> = {};
  for (const [id, view] of trendMap) {
    trendsRecord[String(id)] = view;
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="animate-fade-up">
        <h1 className="type-page text-emerald-950">Insights</h1>
        <p className="type-body mt-2 max-w-2xl text-emerald-950/65">
          Compare two players side-by-side, then scan trade ideas, waivers, and
          news. Every call includes a plain-English reason. Build any package in
          the{" "}
          <PendingLink href="/trades" className="font-semibold text-orange-700">
            Trade Analyzer
          </PendingLink>
          .
        </p>
        {league.isDemo && (
          <p className="type-eyebrow mt-3 text-orange-700">
            Demo league data — guest-friendly
          </p>
        )}
      </div>

      {you && (
        <section className="animate-fade-up-delay">
          <StartSitBoard league={league} you={you} trends={trendsRecord} />
        </section>
      )}

      <section className="animate-fade-up-delay surface-card p-5">
        <h2 className="type-eyebrow mb-3 text-emerald-950/45">
          League avg starter projection
        </h2>
        <div className="flex flex-wrap gap-5">
          {Object.entries(averages).map(([pos, avg]) => (
            <div key={pos} className="space-y-1">
              <PositionChip position={pos} />
              <p className="type-stat text-2xl text-emerald-950">
                {avg.toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {bundle.startSit.length > 0 && (
        <Section
          title="Suggested lineup calls"
          description="Automatic flags from your roster this week — tap Start / Sit above to compare yourself."
          items={bundle.startSit}
          empty=""
          nameById={nameById}
          limit={3}
        />
      )}

      <section className="space-y-4">
        <div className="surface-card flex flex-wrap items-end justify-between gap-3 px-4 py-3 sm:px-5">
          <div>
            <h2 className="type-section text-emerald-950">Trade ideas</h2>
            <p className="type-caption mt-1 text-emerald-950/55">
              Fair full-PPR packages that help both sides — or open the Trade
              Analyzer to grade any deal.
            </p>
          </div>
          <PendingLink
            href="/trades"
            className="shrink-0 text-sm font-semibold text-orange-700 hover:text-orange-800"
          >
            Trade Analyzer →
          </PendingLink>
        </div>
        {bundle.trades.length === 0 ? (
          <p className="type-body text-emerald-950/50">
            No balanced trade ideas found against current positional gaps.
          </p>
        ) : (
          bundle.trades.slice(0, 3).map((insight) => (
            <div key={insight.id} className="space-y-2">
              <InsightCard insight={insight} nameById={nameById} />
              {insight.trade && (
                <PendingLink
                  href={`/trades?partner=${insight.trade.partnerTeamId}&give=${insight.trade.give.map((p) => p.id).join(",")}&get=${insight.trade.receive.map((p) => p.id).join(",")}`}
                  className="inline-flex text-xs font-semibold text-orange-700 hover:text-orange-800"
                >
                  Analyze this trade →
                </PendingLink>
              )}
            </div>
          ))
        )}
      </section>

      <Section
        title="Waiver wire"
        description="Injury-driven pickups available on your league's free-agent list — with who to drop if your roster is full."
        items={bundle.waivers}
        empty="No injury-driven waiver opportunities among current free agents."
        nameById={nameById}
        limit={3}
      />

      <Section
        title="Injury / news"
        description="Public ESPN headlines and roster injury flags. Links open the source."
        items={bundle.news}
        empty="No matching ESPN headlines right now. Roster injury flags appear when present."
        nameById={nameById}
        limit={3}
      />

      <Section
        title="Matchup notes"
        description="When similar players have struggled (or thrived) against this week's defense."
        items={bundle.matchupNotes}
        empty="No tough historical defense matchups flagged for your starters."
        nameById={nameById}
        limit={3}
      />

      <Section
        title="Also worth a look"
        description="Roster gaps, drop/adds, schedule mismatches, and streaming kickers or defenses."
        items={bundle.other}
        empty="Nothing else flagged this week."
        nameById={nameById}
        limit={3}
      />

      <section>
        <h2 className="type-section mb-3 text-emerald-950">League</h2>
        <p className="mb-2 text-sm text-emerald-950/55">
          Standings with tap-to-expand rosters.{" "}
          <PendingLink href="/league" className="font-semibold text-orange-700">
            Open League →
          </PendingLink>
        </p>
      </section>
    </div>
  );
}
