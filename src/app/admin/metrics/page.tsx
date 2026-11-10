import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  isAdminUser,
  loadProductMetrics,
  type WeekMetrics,
} from "@/lib/analytics/metrics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Metrics · Gridiron IQ",
  robots: { index: false, follow: false },
};

function num(n: number | null, digits = 1): string {
  return n == null ? "—" : n.toFixed(digits);
}

function usd(n: number | null, digits = 4): string {
  return n == null ? "—" : `$${n.toFixed(digits)}`;
}

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-stone-500">{sub}</p> : null}
    </div>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm tabular-nums">
        <thead>
          <tr className="border-b border-stone-300 text-left text-xs uppercase tracking-wide text-stone-500">
            {head.map((h, i) => (
              <th key={h} className={i === 0 ? "py-2 pr-3" : "py-2 pr-3 text-right"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="py-3 text-stone-500" colSpan={head.length}>
                No data yet.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-stone-200 last:border-0">
                {r.map((c, j) => (
                  <td key={j} className={j === 0 ? "py-1.5 pr-3" : "py-1.5 pr-3 text-right"}>
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function weekLabel(w: WeekMetrics, i: number): string {
  return i === 0 ? `${w.start} → ${w.end} (last 7d)` : `${w.start} → ${w.end}`;
}

/**
 * Launch dashboard: WAU, questions per user, cost per question. Visible only
 * to verified accounts listed in ADMIN_EMAILS; everyone else gets a 404.
 */
export default async function AdminMetricsPage() {
  const session = await auth();
  if (!(await isAdminUser(session?.user?.id))) notFound();

  const m = await loadProductMetrics({ weeks: 8 });
  const now = m.weeks[0]!;
  const prev = m.weeks[1];

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header>
        <h1 className="font-display text-3xl">Product metrics</h1>
        <p className="mt-1 text-sm text-stone-500">
          Trailing 7-day UTC windows. Generated {m.generatedAt}. Questions are
          completed chat turns; cost is gateway per-token pricing × recorded
          tokens (turns without pricing are excluded from cost per question).
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Weekly active users"
          value={String(now.activeUsers)}
          sub={`${now.activeSignedIn} signed in · ${now.activeGuests} guests${
            prev ? ` · prev ${prev.activeUsers}` : ""
          }`}
        />
        <Tile
          label="Questions / active user"
          value={num(now.questionsPerActiveUser)}
          sub={`${now.questions} questions · ${num(now.questionsPerAsker)} per asker`}
        />
        <Tile
          label="Cost / question"
          value={usd(now.costPerQuestionUsd)}
          sub={`priced ${pct(now.costCoverage)} of turns`}
        />
        <Tile
          label="AI spend (7d)"
          value={usd(now.costUsd, 2)}
          sub={`${num(now.toolCallsPerQuestion)} tool calls / question`}
        />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">By week</h2>
        <Table
          head={["Week", "WAU", "Signed in", "Guests", "Questions", "Askers", "Q / WAU", "$ / Q", "Spend", "Tools / Q", "Tokens / Q"]}
          rows={m.weeks.map((w, i) => [
            weekLabel(w, i),
            w.activeUsers,
            w.activeSignedIn,
            w.activeGuests,
            w.questions,
            w.askers,
            num(w.questionsPerActiveUser),
            usd(w.costPerQuestionUsd),
            usd(w.costUsd, 2),
            num(w.toolCallsPerQuestion),
            num(w.tokensPerQuestion, 0),
          ])}
        />
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Sources (last 7d)</h2>
          <Table
            head={["Source", "Active", "New users"]}
            rows={m.sourcesThisWeek.map((s) => [s.source, s.activeUsers, s.newAccounts])}
          />
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold">Events (last 7d)</h2>
          <Table
            head={["Event", "Count", "Users"]}
            rows={m.eventsThisWeek.map((e) => [e.name, e.count, e.users])}
          />
          {m.blockedThisWeek.length > 0 ? (
            <>
              <h3 className="mb-2 mt-6 text-sm font-semibold">Chat blocked, by reason</h3>
              <Table
                head={["Reason", "Count"]}
                rows={m.blockedThisWeek.map((b) => [b.reason, b.count])}
              />
            </>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Daily (last 14 days)</h2>
        <Table
          head={["Day", "DAU", "Questions"]}
          rows={[...m.daily].reverse().map((d) => [d.day, d.activeUsers, d.questions])}
        />
      </section>
    </main>
  );
}
