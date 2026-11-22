import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOOLS = [
  {
    href: "/trades",
    title: "Trade Analyzer",
    body: "Grade any trade on season points per game.",
  },
  {
    href: "/trades?tool=who-to-start",
    title: "Who to Start",
    body: "Compare players on projections, form, injuries and matchup.",
  },
  {
    href: "/insights",
    title: "Insights",
    body: "Weekly points, usage trends and waiver watch for your roster.",
  },
];

/**
 * Home when AI chat is switched off (CHAT_DISABLED or no gateway): no chat
 * box that can only fail — just the tools that work without it.
 */
export function ChatOffline({
  userName,
  hasLeague,
}: {
  userName?: string | null;
  hasLeague: boolean;
}) {
  const first = userName?.trim().split(/\s+/)[0];
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-2">
      <header className="space-y-1">
        <p className="type-eyebrow text-orange-700">Gridiron IQ</p>
        <h1 className="type-page text-emerald-950">{first ? `Hey ${first}` : "Welcome"}</h1>
        <p className="type-body text-emerald-950/65">
          AI chat is offline for now. Everything below works on live NFL data.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-3">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="surface-card block h-full p-4 transition hover:border-orange-600/40"
            >
              <p className="font-semibold text-emerald-950">{t.title}</p>
              <p className="mt-1 text-sm text-emerald-950/60">{t.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      {!hasLeague && (
        <Link href="/connect" className={cn(buttonVariants({ variant: "primary" }))}>
          Connect your league
        </Link>
      )}
    </div>
  );
}
