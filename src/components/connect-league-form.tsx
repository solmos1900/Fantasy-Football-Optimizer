"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SyncButton } from "@/components/sync-button";
import { Button } from "@/components/ui/button";
import { scrollToTopNow } from "@/components/scroll-to-top";
import { defaultEspnSeasonClient } from "@/lib/season";

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

type ConnectAction = "demo" | "espn" | null;

export function ConnectLeagueForm({ connection, isGuest }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [action, setAction] = useState<ConnectAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReconnect, setShowReconnect] = useState(!connection);
  const [form, setForm] = useState({
    leagueId: connection && !connection.isDemo ? connection.leagueId : "",
    season: String(connection?.season ?? defaultEspnSeasonClient()),
    teamId: connection?.teamId != null ? String(connection.teamId) : "",
    swid: "",
    espnS2: "",
  });

  const demoLoading = action === "demo";
  const espnLoading = action === "espn";
  const busy = action != null;

  function connectDemo() {
    setError(null);
    setAction("demo");
    startTransition(async () => {
      try {
        const res = await fetch("/api/league/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "demo" }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Demo connect failed");
          setAction(null);
          return;
        }
        scrollToTopNow();
        router.push("/dashboard");
        router.refresh();
      } catch {
        setError("Demo connect failed");
        setAction(null);
      }
    });
  }

  function connectEspn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAction("espn");
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
          setAction(null);
          return;
        }
        scrollToTopNow();
        router.push("/dashboard");
        router.refresh();
      } catch {
        setError("ESPN connect failed");
        setAction(null);
      }
    });
  }

  return (
    <div className="space-y-10">
      {connection && (
        <section className="animate-fade-up surface-card p-5 sm:p-6">
          <p className="type-eyebrow text-orange-700">
            Saved on this {isGuest ? "guest" : "signed-in"} account
          </p>
          <h2 className="type-page mt-1 text-emerald-950">
            {connection.leagueName ?? `League ${connection.leagueId}`}
          </h2>
          <p className="type-body mt-2 max-w-2xl text-emerald-950/65">
            Connecting once saves the league on your user record. Come back any
            time — use <span className="font-semibold text-emerald-950">Sync</span>{" "}
            to refresh ESPN (or re-seed demo). You do not need to re-enter the
            League ID each visit.
          </p>
          <dl className="mt-4 grid gap-3 text-sm text-emerald-950/70 sm:grid-cols-2">
            <div>
              <dt className="type-caption text-emerald-950/45">Source</dt>
              <dd className="mt-0.5 font-medium text-emerald-950">
                {connection.isDemo ? "Demo seed" : "ESPN"} · ID{" "}
                {connection.leagueId} · Season {connection.season}
              </dd>
            </div>
            <div>
              <dt className="type-caption text-emerald-950/45">Last sync</dt>
              <dd className="mt-0.5 font-medium text-emerald-950">
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
          <p className="type-caption mt-4 max-w-2xl leading-relaxed text-emerald-950/55">
            {isGuest
              ? "Guest leagues stay on this guest session only. Signing in with Google, GitHub, or email creates a separate account that does not inherit this connection — connect again after you sign in."
              : "This league is tied to your signed-in account. Guest mode uses a different account and will not show this league."}
          </p>
        </section>
      )}

      {showReconnect && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="animate-fade-up surface-card p-5 sm:p-6">
            <h2 className="type-section text-emerald-950">Try demo mode</h2>
            <p className="type-body mt-2 max-w-md text-emerald-950/65">
              Load a seeded 8-team league with rosters, matchups, free agents, and
              insights — no ESPN credentials required.
            </p>
            <Button
              type="button"
              variant="primary"
              className="mt-5"
              onClick={connectDemo}
              disabled={busy}
              loading={demoLoading}
            >
              {demoLoading ? "Loading…" : "Load demo league"}
            </Button>
          </div>

          <form
            onSubmit={connectEspn}
            className="animate-fade-up-delay surface-card space-y-4 p-5 sm:p-6"
          >
            <div>
              <h2 className="type-section text-emerald-950">
                {connection ? "Connect another ESPN league" : "Connect ESPN league"}
              </h2>
              <p className="type-body mt-2 text-emerald-950/65">
                Public leagues need only League ID + season. Private leagues also
                need SWID and espn_s2 cookies from fantasy.espn.com. After the
                first connect, use Sync to refresh — credentials stay on your
                account.
              </p>
            </div>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-emerald-950">
                League ID
              </span>
              <input
                required
                value={form.leagueId}
                onChange={(e) => setForm({ ...form, leagueId: e.target.value })}
                className="field-input"
                placeholder="e.g. 123456789"
                disabled={busy}
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
                  disabled={busy}
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
                  placeholder="Optional"
                  disabled={busy}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-emerald-950">
                SWID (private)
              </span>
              <input
                value={form.swid}
                onChange={(e) => setForm({ ...form, swid: e.target.value })}
                className="field-input font-mono text-base"
                placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                disabled={busy}
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
                disabled={busy}
              />
            </label>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="secondary"
              disabled={busy}
              loading={espnLoading}
            >
              {espnLoading ? "Saving…" : "Connect & save"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
