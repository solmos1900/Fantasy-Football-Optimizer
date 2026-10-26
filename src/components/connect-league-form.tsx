"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SyncButton } from "@/components/sync-button";
import { Button } from "@/components/ui/button";
import { scrollToTopNow } from "@/components/scroll-to-top";
import { defaultEspnSeasonClient } from "@/lib/season";
import { ESPN_COOKIE_HELP } from "@/lib/onboarding/content";
import { SleeperConnectCard } from "@/components/sleeper-connect-card";
import { cn } from "@/lib/utils";
import { useClientValue } from "@/lib/use-client-state";

type Platform = "espn" | "sleeper";

export type ConnectedLeagueSummary = {
  platform: Platform;
  leagueId: string;
  season: number;
  leagueName: string | null;
  isDemo: boolean;
  teamId: number | null;
  lastSyncedAt: string | null;
};

type Props = {
  connection: ConnectedLeagueSummary | null;
  isGuest: boolean;
};

export function ConnectLeagueForm({ connection, isGuest }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const espnCardRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  // Explicit tab choice; until the user picks, a #sleeper deep link or the
  // saved connection decides (hash read after hydration, no setState-in-effect).
  const [chosenPlatform, setPlatform] = useState<Platform | null>(null);
  const hash = useClientValue(() => window.location.hash, "");
  const platform: Platform =
    chosenPlatform ??
    (hash === "#sleeper" || connection?.platform === "sleeper"
      ? "sleeper"
      : "espn");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    leagueId: connection && !connection.isDemo ? connection.leagueId : "",
    season: String(connection?.season ?? defaultEspnSeasonClient()),
    teamId: connection?.teamId != null ? String(connection.teamId) : "",
    swid: "",
    espnS2: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#espn") return;
    espnCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const leagueInput = espnCardRef.current?.querySelector<HTMLInputElement>(
      'input[name="leagueId"], input[placeholder*="123456789"]',
    );
    leagueInput?.focus({ preventScroll: true });
  }, []);

  function connectEspn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/league/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "espn",
            leagueId: form.leagueId,
            season: Number(form.season),
            teamId: form.teamId ? Number(form.teamId) : undefined,
            swid: form.swid || undefined,
            espnS2: form.espnS2 || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "ESPN connect failed");
          setLoading(false);
          return;
        }
        scrollToTopNow();
        router.push("/dashboard");
        router.refresh();
      } catch {
        setError("ESPN connect failed");
        setLoading(false);
      }
    });
  }

  const liveConnection = connection && !connection.isDemo ? connection : null;

  return (
    <div className="space-y-10">
      {liveConnection && (
        <section className="animate-fade-up surface-card p-5 sm:p-6">
          <p className="type-eyebrow text-orange-700">
            Saved on this {isGuest ? "guest" : "signed-in"} account
          </p>
          <h2 className="type-page mt-1 text-emerald-950">
            {liveConnection.leagueName ?? `League ${liveConnection.leagueId}`}
          </h2>
          <p className="type-body mt-2 max-w-2xl text-emerald-950/65">
            Your league stays on this account. Use{" "}
            <span className="font-semibold text-emerald-950">Sync</span> to
            refresh, or reconnect below anytime.
          </p>
          <dl className="mt-4 grid gap-3 text-sm text-emerald-950/70 sm:grid-cols-2">
            <div>
              <dt className="type-caption text-emerald-950/45">Source</dt>
              <dd className="mt-0.5 font-medium text-emerald-950">
                {liveConnection.platform === "sleeper" ? "Sleeper" : "ESPN"} · ID{" "}
                {liveConnection.leagueId} · Season {liveConnection.season}
              </dd>
            </div>
            <div>
              <dt className="type-caption text-emerald-950/45">Last sync</dt>
              <dd className="mt-0.5 font-medium text-emerald-950">
                {liveConnection.lastSyncedAt
                  ? new Date(liveConnection.lastSyncedAt).toLocaleString()
                  : "Not synced yet"}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <SyncButton />
          </div>
          <p className="type-caption mt-4 max-w-2xl leading-relaxed text-emerald-950/55">
            {isGuest
              ? "Guest leagues stay on this guest session only. Signing in with Google, GitHub, or email creates a separate account that does not inherit this connection — connect again after you sign in."
              : "This league is tied to your signed-in account. Guest mode uses a different account and will not show this league."}
          </p>
        </section>
      )}

      <div
        role="tablist"
        aria-label="Fantasy platform"
        className="inline-flex rounded-xl border border-emerald-950/12 p-1"
      >
        {(["espn", "sleeper"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={platform === p}
            onClick={() => setPlatform(p)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
              platform === p
                ? "bg-orange-600 text-white"
                : "text-emerald-950/60 hover:text-emerald-950",
            )}
          >
            {p === "espn" ? "ESPN" : "Sleeper"}
          </button>
        ))}
      </div>

      {platform === "sleeper" ? <SleeperConnectCard /> : null}

      <form
        id="espn"
        ref={espnCardRef}
        hidden={platform !== "espn"}
        onSubmit={connectEspn}
        className="animate-fade-up surface-card scroll-mt-24 space-y-4 p-5 sm:p-6"
      >
        <div>
          <p className="type-eyebrow text-orange-700">Connect ESPN</p>
          <h3 className="type-section mt-1 text-emerald-950">
            Connect ESPN league
          </h3>
          <p className="type-body mt-2 text-emerald-950/65">
            Public leagues need only League ID + season. Private leagues also
            need SWID and espn_s2 cookies from fantasy.espn.com. Treat them
            like passwords — they are encrypted at rest on your account.
            Without a league, Trades tools still work on the full NFL player
            pool using full PPR.
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-emerald-950">
            League ID
          </span>
          <input
            name="leagueId"
            required
            value={form.leagueId}
            onChange={(e) => setForm({ ...form, leagueId: e.target.value })}
            className="field-input"
            placeholder="e.g. 123456789"
            disabled={loading}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-emerald-950">
              Season
            </span>
            <input
              required
              type="number"
              value={form.season}
              onChange={(e) => setForm({ ...form, season: e.target.value })}
              className="field-input"
              disabled={loading}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-emerald-950">
              Your team ID
            </span>
            <input
              type="number"
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              className="field-input"
              placeholder={
                liveConnection?.teamId != null
                  ? `Saved: ${liveConnection.teamId}`
                  : "Required for My Team"
              }
              disabled={loading}
            />
            <span className="mt-1 block text-xs text-emerald-950/50">
              {liveConnection?.teamId != null
                ? "Leave blank to keep your saved team."
                : "Find it in ESPN under your league standings (team number)."}
            </span>
          </label>
        </div>

        <details className="group rounded-xl border border-emerald-950/12 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-emerald-950/80 marker:text-orange-700">
            Private league? How to find SWID and espn_s2
          </summary>
          <div className="mt-2 space-y-3 pb-1 text-emerald-950/65">
            <p>
              Public leagues can leave both fields blank. For a private league,
              copy two cookies from a computer browser where you&apos;re signed
              in to ESPN. Treat them like passwords.
            </p>
            {ESPN_COOKIE_HELP.map((guide) => (
              <div key={guide.browser}>
                <p className="font-semibold text-emerald-950/80">
                  {guide.browser}
                </p>
                <ol className="ml-5 mt-1 list-decimal space-y-1">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </details>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-emerald-950">
            SWID (private)
          </span>
          <input
            value={form.swid}
            onChange={(e) => setForm({ ...form, swid: e.target.value })}
            className="field-input font-mono text-base"
            placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
            disabled={loading}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-emerald-950">
            espn_s2 (private)
          </span>
          <textarea
            value={form.espnS2}
            onChange={(e) => setForm({ ...form, espnS2: e.target.value })}
            rows={3}
            className="field-input font-mono text-base"
            placeholder="Long cookie value — keep URL encoding"
            disabled={loading}
          />
        </label>

        {liveConnection && (
          <p className="text-xs text-emerald-950/50">
            Leave SWID and espn_s2 blank to keep the ESPN login already saved
            on this account. Paste new values only when you need to replace
            them.
          </p>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={loading} loading={loading}>
          {loading ? "Saving…" : "Connect & save"}
        </Button>
      </form>
    </div>
  );
}
