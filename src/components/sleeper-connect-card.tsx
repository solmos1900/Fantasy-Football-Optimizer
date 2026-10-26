"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { scrollToTopNow } from "@/components/scroll-to-top";
import { defaultEspnSeasonClient } from "@/lib/season";
import { cn } from "@/lib/utils";

type SleeperLeagueOption = {
  leagueId: string;
  name: string;
  teams: number | null;
  status: string | null;
  scoring: string;
};

/**
 * Sleeper connect: username → pick a league → save. Sleeper's API is public,
 * so there are no cookies; your team is found from your username.
 */
export function SleeperConnectCard() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [season, setSeason] = useState(String(defaultEspnSeasonClient()));
  const [leagues, setLeagues] = useState<SleeperLeagueOption[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findLeagues(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLeagues(null);
    setSelected(null);
    setSearching(true);
    try {
      const qs = new URLSearchParams({ username: username.trim(), season });
      const res = await fetch(`/api/league/sleeper/leagues?${qs}`);
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        leagues?: SleeperLeagueOption[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not look up that Sleeper account.");
        return;
      }
      const list = data.leagues ?? [];
      setLeagues(list);
      if (list.length === 1) setSelected(list[0]!.leagueId);
    } catch {
      setError("Could not reach Sleeper. Try again in a minute.");
    } finally {
      setSearching(false);
    }
  }

  function connect() {
    if (!selected) return;
    setError(null);
    setSaving(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/league/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "sleeper",
            leagueId: selected,
            season: Number(season),
            sleeperUsername: username.trim(),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Sleeper connect failed.");
          setSaving(false);
          return;
        }
        scrollToTopNow();
        router.push("/dashboard");
        router.refresh();
      } catch {
        setError("Sleeper connect failed.");
        setSaving(false);
      }
    });
  }

  return (
    <section
      id="sleeper"
      className="animate-fade-up surface-card scroll-mt-24 space-y-4 p-5 sm:p-6"
    >
      <div>
        <p className="type-eyebrow text-orange-700">Connect Sleeper</p>
        <h3 className="type-section mt-1 text-emerald-950">
          Connect Sleeper league
        </h3>
        <p className="type-body mt-2 text-emerald-950/65">
          Just your Sleeper username — no passwords or cookies. We find your
          leagues and your team automatically. Works on your phone.
        </p>
      </div>

      <form onSubmit={findLeagues} className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-emerald-950">
              Sleeper username
            </span>
            <input
              name="sleeperUsername"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="field-input"
              placeholder="e.g. fantasyfan22"
              disabled={searching || saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-emerald-950">
              Season
            </span>
            <input
              required
              type="number"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="field-input"
              disabled={searching || saving}
            />
          </label>
        </div>
        <Button
          type="submit"
          variant="secondary"
          disabled={searching || saving || !username.trim()}
          loading={searching}
        >
          {searching ? "Looking…" : "Find my leagues"}
        </Button>
      </form>

      {leagues && leagues.length === 0 && (
        <p className="rounded-xl bg-emerald-950/5 px-3 py-2 text-sm text-emerald-950/70">
          No {season} NFL leagues on that Sleeper account. Check the username
          or season.
        </p>
      )}

      {leagues && leagues.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium text-emerald-950">
            Pick a league
          </legend>
          {leagues.map((l) => (
            <label
              key={l.leagueId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                selected === l.leagueId
                  ? "border-orange-500/60 bg-orange-50/40"
                  : "border-emerald-950/12 hover:border-emerald-950/25",
              )}
            >
              <input
                type="radio"
                name="sleeperLeague"
                value={l.leagueId}
                checked={selected === l.leagueId}
                onChange={() => setSelected(l.leagueId)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-emerald-950">
                  {l.name}
                </span>
                <span className="block text-xs text-emerald-950/55">
                  {[l.teams ? `${l.teams} teams` : null, l.scoring]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          ))}
          <Button
            type="button"
            variant="primary"
            className="mt-2"
            disabled={!selected || saving}
            loading={saving}
            onClick={connect}
          >
            {saving ? "Saving…" : "Connect & save"}
          </Button>
        </fieldset>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
