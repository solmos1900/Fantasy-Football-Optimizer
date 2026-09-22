import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLeagueDataForUser } from "@/lib/league/service";
import { generateInsights, leaguePositionalAverages } from "@/lib/insights/engine";
import { cn, priorityColor } from "@/lib/utils";

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
          Connect a league to generate start/sit, drop/add, and mismatch recommendations.
        </p>
        <Link href="/connect" className="mt-4 inline-flex text-sm font-semibold text-orange-700">
          Connect league →
        </Link>
      </div>
    );
  }

  const insights = generateInsights(league);
  const averages = leaguePositionalAverages(league);

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="font-[family-name:var(--font-display)] text-4xl uppercase tracking-wide text-emerald-950">
          Insights
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-950/65">
          Rule-based heuristics for v1 — every recommendation includes the
          thresholds and comparisons that produced it.
        </p>
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

      <section className="animate-fade-up-delay-2 space-y-4">
        {insights.length === 0 && (
          <p className="text-sm text-emerald-950/55">
            No inefficiencies flagged this week. Your lineup looks balanced vs league averages.
          </p>
        )}
        {insights.map((insight) => (
          <article
            key={insight.id}
            className={cn(
              "border-l-4 py-3 pl-4 pr-2",
              priorityColor(insight.priority),
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-950/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-950/70">
                {insight.type.replace("_", "/")}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                {insight.priority}
              </span>
            </div>
            <h3 className="mt-1 text-lg font-semibold text-emerald-950">{insight.title}</h3>
            <p className="text-sm text-emerald-950/65">{insight.summary}</p>
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
          </article>
        ))}
      </section>
    </div>
  );
}
