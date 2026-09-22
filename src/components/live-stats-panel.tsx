"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { LiveStatSnapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function LiveStatsPanel({ initial }: { initial: LiveStatSnapshot }) {
  const [live, setLive] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/stats/live", { cache: "no-store" });
        if (!res.ok) throw new Error("Refresh failed");
        const data = await res.json();
        setLive(data.live);
        setError(null);
      } catch {
        setError("Could not refresh live stats");
      }
    });
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <section className="surface-card animate-fade-up p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="type-section text-emerald-950">
            Live week {live.week}
          </h2>
          <p className="type-caption mt-0.5 text-emerald-950/55">
            Updated {new Date(live.updatedAt).toLocaleTimeString()}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={refresh}
          disabled={pending}
          loading={pending}
        >
          {pending ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {live.games.map((g) => (
          <div
            key={g.id}
            className="rounded-xl border border-emerald-950/8 bg-white/50 px-3 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between type-caption font-semibold text-emerald-950/45">
              <span>
                {g.status === "in_progress"
                  ? `${g.quarter ?? ""} ${g.clock ?? ""}`.trim() || "LIVE"
                  : g.status === "final"
                    ? "Final"
                    : "Scheduled"}
              </span>
              {g.status === "in_progress" && (
                <span className="inline-flex items-center gap-1 text-orange-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
                  Live
                </span>
              )}
            </div>
            <div className="flex items-center justify-between font-medium text-emerald-950">
              <span>{g.away}</span>
              <span className="type-stat text-xl">{g.awayScore}</span>
            </div>
            <div className="flex items-center justify-between font-medium text-emerald-950">
              <span>{g.home}</span>
              <span className="type-stat text-xl">{g.homeScore}</span>
            </div>
          </div>
        ))}
      </div>

      {live.topPerformers.length > 0 && (
        <div className="mt-6">
          <h3 className="type-eyebrow mb-2 text-emerald-950/45">Top scorers</h3>
          <ul className="space-y-1.5">
            {live.topPerformers.map((p) => (
              <li
                key={`${p.playerName}-${p.points}`}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-emerald-950">
                  {p.playerName}{" "}
                  <span className="text-emerald-950/45">
                    {p.position} · {p.team}
                  </span>
                </span>
                <span className="type-stat text-lg text-orange-600">
                  {p.points.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
