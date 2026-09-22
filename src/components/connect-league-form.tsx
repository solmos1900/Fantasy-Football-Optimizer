"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SyncButton } from "@/components/sync-button";

export type ConnectedLeagueSummary = {
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showReconnect, setShowReconnect] = useState(!connection);
  const [form, setForm] = useState({
    leagueId: connection && !connection.isDemo ? connection.leagueId : "",
    season: String(
      connection?.season ?? process.env.NEXT_PUBLIC_DEFAULT_SEASON ?? "2025",
    ),
    teamId: connection?.teamId != null ? String(connection.teamId) : "",
    swid: "",
    espnS2: "",
  });

  function connectDemo() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/league/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "demo" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Demo connect failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function connectEspn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
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
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      {connection && (
        <section className="animate-fade-up border-b border-emerald-950/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">
            Saved on this {isGuest ? "guest" : "signed-in"} account
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide text-emerald-950">
            {connection.leagueName ?? `League ${connection.leagueId}`}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-950/65">
            Connecting once saves the league on your user record. Come back any
            time — use <span className="font-semibold text-emerald-950">Sync</span>{" "}
            to refresh ESPN (or re-seed demo). You do not need to re-enter the
            League ID each visit.
          </p>
          <dl className="mt-4 grid gap-2 text-sm text-emerald-950/70 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-emerald-950/45">
                Source
              </dt>
              <dd className="font-medium text-emerald-950">
                {connection.isDemo ? "Demo seed" : "ESPN"} · ID{" "}
                {connection.leagueId} · Season {connection.season}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-emerald-950/45">
                Last sync
              </dt>
              <dd className="font-medium text-emerald-950">
                {connection.lastSyncedAt
                  ? new Date(connection.lastSyncedAt).toLocaleString()
                  : "Not synced yet"}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <SyncButton />
            <button
              type="button"
              onClick={() => setShowReconnect((v) => !v)}
              className="text-sm font-semibold text-orange-700 hover:text-orange-600"
            >
              {showReconnect ? "Hide connect form" : "Connect a different league"}
            </button>
          </div>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-emerald-950/55">
            {isGuest
              ? "Guest leagues stay on this guest session only. Signing in with Google, GitHub, or email creates a separate account that does not inherit this connection — connect again after you sign in."
              : "This league is tied to your signed-in account. Guest mode uses a different account and will not show this league."}
          </p>
        </section>
      )}

      {showReconnect && (
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="animate-fade-up">
            <h2 className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide text-emerald-950">
              Try demo mode
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-emerald-950/65">
              Load a seeded 8-team league with rosters, matchups, free agents, and
              insights — no ESPN credentials required. Saved on this account like
              a real connect.
            </p>
            <button
              type="button"
              onClick={connectDemo}
              disabled={pending}
              className="mt-5 rounded-md bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:opacity-60"
            >
              {pending ? "Loading…" : "Load demo league"}
            </button>
          </div>

          <form onSubmit={connectEspn} className="animate-fade-up-delay space-y-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl uppercase tracking-wide text-emerald-950">
                {connection ? "Connect another ESPN league" : "Connect ESPN league"}
              </h2>
              <p className="mt-2 text-sm text-emerald-950/65">
                Public leagues need only League ID + season. Private leagues also
                need SWID and espn_s2 cookies from fantasy.espn.com. After the
                first connect, use Sync on this page, Home, or League to refresh —
                credentials stay on your account.
              </p>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-emerald-950">
                League ID
              </span>
              <input
                required
                value={form.leagueId}
                onChange={(e) => setForm({ ...form, leagueId: e.target.value })}
                className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 outline-none ring-orange-500/40 focus:ring-2"
                placeholder="e.g. 123456789"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-emerald-950">
                  Season
                </span>
                <input
                  required
                  type="number"
                  value={form.season}
                  onChange={(e) => setForm({ ...form, season: e.target.value })}
                  className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 outline-none ring-orange-500/40 focus:ring-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-emerald-950">
                  Your team ID
                </span>
                <input
                  type="number"
                  value={form.teamId}
                  onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                  className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 outline-none ring-orange-500/40 focus:ring-2"
                  placeholder="Optional"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-emerald-950">
                SWID (private)
              </span>
              <input
                value={form.swid}
                onChange={(e) => setForm({ ...form, swid: e.target.value })}
                className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 font-mono text-base outline-none ring-orange-500/40 focus:ring-2"
                placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-emerald-950">
                espn_s2 (private)
              </span>
              <textarea
                value={form.espnS2}
                onChange={(e) => setForm({ ...form, espnS2: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-emerald-950/15 bg-white px-3 py-2 font-mono text-base outline-none ring-orange-500/40 focus:ring-2"
                placeholder="Long cookie value — keep URL encoding"
              />
            </label>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-emerald-950 px-5 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-900 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Connect & save"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
