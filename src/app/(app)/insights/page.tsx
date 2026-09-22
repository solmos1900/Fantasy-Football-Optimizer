import Link from "next/link";
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
import { cn, priorityColor } from "@/lib/utils";
import type { InsightRecommendation } from "@/lib/types";

function InsightCard({ insight }: { insight: InsightRecommendation }) {
  return (
    <article
      className={cn("border-l-4 py-3 pl-4 pr-2", priorityColor(insight.priority))}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-emerald-950/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/70">
          {insight.type.replaceAll("_", " ")}
        </span>
        {insight.verdict && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              insight.verdict === "START"
                ? "bg-emerald-700 text-white"
                : "bg-orange-700 text-white",
            )}
          >
            {insight.verdict}
          </span>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-700">
          {insight.priority}
        </span>
      </div>
      <h3 className="mt-1 text-lg font-semibold text-emerald-950">{insight.title}</h3>
      <p className="text-sm text-emerald-950/65">{insight.summary}</p>

      {insight.trade && (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
              You give
            </p>
            <ul className="mt-1 space-y-0.5">
              {insight.trade.give.map((p) => (
                <li key={p.id}>
                  {p.name}{" "}
                  <span className="text-emerald-950/45">({p.position})</span>
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
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
              You get from {insight.trade.partnerTeamName}
            </p>
            <ul className="mt-1 space-y-0.5">
              {insight.trade.receive.map((p) => (
                <li key={p.id}>
                  {p.name}{" "}
                  <span className="text-emerald-950/45">({p.position})</span>
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
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {insight.reasoning.map((reason) => (
          <li
            key={reason}
            className="flex gap-2 text-sm leading-relaxed text-emerald-950/80"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-500" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      {insight.newsUrl && (
        <a
          href={insight.newsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-sm font-semibold text-orange-700 hover:text-orange-800"
        >
          {insight.source ?? "Source"} →
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
}: {
  title: string;
  description: string;
  items: InsightRecommendation[];
  empty: string;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide text-emerald-950">
          {title}
        </h2>
        <p className="mt-1 text-sm text-emerald-950/55">{description}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-emerald-950/50">{empty}</p>
      ) : (
        items.map((insight) => <InsightCard key={insight.id} insight={insight} />)
      )}
    </section>
  );
}

export default async function InsightsPage() {
  const session = await auth();
  const league = session?.user?.id
    ? await getLeagueDataForUser(session.user.id)
    : null;

  if (!league) {
    return (
      <div className="max-w-lg">
        <h1 className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide">
          Insights
        </h1>
        <p className="mt-2 text-sm text-emerald-950/65">
          Connect a league (or load the demo league as a guest) to unlock
          start/sit, mutual trades, injury/news, and defense matchup history.
        </p>
        <Link
          href="/connect"
          className="mt-4 inline-flex text-sm font-semibold text-orange-700"
        >
          Connect league →
        </Link>
      </div>
    );
  }

  const rosterPlayers = league.teams.flatMap((t) => t.roster);
  let newsItems = await fetchEspnPlayerNews(rosterPlayers, 8);
  if (!newsItems.length) {
    newsItems = newsFromRosterInjuries(rosterPlayers);
  }

  const bundle = buildInsightsBundle(league, newsItems);
  const averages = leaguePositionalAverages(league);

  return (
    <div className="space-y-10">
      <div className="animate-fade-up">
        <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
          Insights
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-950/65">
          Rule-based start/sit and league-aware trades with transparent reasons —
          projections, recent form, injury status, and how similar players fared
          against this week&apos;s defense. News comes from ESPN public feeds
          (never invented).
        </p>
        {league.isDemo && (
          <p className="mt-2 text-xs font-medium uppercase tracking-wider text-orange-700">
            Demo league data — guest-friendly
          </p>
        )}
      </div>

      <section className="animate-fade-up-delay">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-950/45">
          League avg starter projection
        </h2>
        <div className="flex flex-wrap gap-4">
          {Object.entries(averages).map(([pos, avg]) => (
            <div key={pos}>
              <span className="text-xs text-emerald-950/50">{pos}</span>
              <p className="font-[family-name:var(--font-display)] text-2xl text-emerald-950">
                {avg.toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Section
        title="Start / Sit"
        description="Bench vs lineup calls with projection, recent form, injury, and defense-history reasons."
        items={bundle.startSit}
        empty="No start/sit inefficiencies flagged this week."
      />

      <Section
        title="Trade ideas"
        description="Mutually beneficial 1-for-1 or small packages — why it helps both sides."
        items={bundle.trades}
        empty="No balanced trade ideas found against current positional gaps."
      />

      <Section
        title="Injury / news"
        description="Public ESPN headlines and roster injury flags. Links open the source."
        items={bundle.news}
        empty="No matching ESPN headlines right now. Roster injury flags appear when present."
      />

      <Section
        title="Matchup notes"
        description="Similar-player vs defense history — e.g. slot WRs shut down by CLE recently."
        items={bundle.matchupNotes}
        empty="No tough historical defense matchups flagged for your starters."
      />

      <Section
        title="Also worth a look"
        description="Weak positions, drop/add, weekly mismatch, and streaming K/D/ST."
        items={bundle.other}
        empty="Nothing else flagged this week."
      />

      <section>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl uppercase tracking-wide">
          Full league snapshot
        </h2>
        <p className="mb-4 text-sm text-emerald-950/55">
          Standings and every roster so trade and start/sit context is league-wide.{" "}
          <Link href="/league" className="font-semibold text-orange-700">
            Open League →
          </Link>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-emerald-950/10 text-xs uppercase tracking-wider text-emerald-950/45">
                <th className="py-2 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">Team</th>
                <th className="py-2 pr-2 font-semibold">Record</th>
                <th className="py-2 pr-2 font-semibold">PF</th>
                <th className="py-2 font-semibold">Top starters</th>
              </tr>
            </thead>
            <tbody>
              {[...league.teams]
                .sort(
                  (a, b) => a.standing - b.standing || b.pointsFor - a.pointsFor,
                )
                .map((t) => (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b border-emerald-950/5",
                      t.isCurrentUser && "bg-orange-50/60",
                    )}
                  >
                    <td className="py-2.5 pr-2 font-[family-name:var(--font-display)] text-lg">
                      {t.standing}
                    </td>
                    <td className="py-2.5 pr-2 font-medium">
                      {t.name}
                      {t.isCurrentUser && (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-orange-700">
                          you
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2">
                      {t.wins}-{t.losses}
                      {t.ties ? `-${t.ties}` : ""}
                    </td>
                    <td className="py-2.5 pr-2">{t.pointsFor.toFixed(1)}</td>
                    <td className="py-2.5 text-emerald-950/70">
                      {t.roster
                        .filter((p) => p.isStarter)
                        .slice(0, 4)
                        .map((p) => p.name)
                        .join(", ")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
