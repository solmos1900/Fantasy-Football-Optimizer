import {
  formatPoolFreshnessLabel,
  type PlayerPoolFreshness,
} from "@/lib/players/pool";
import type { GoldenCheckResult } from "@/lib/accuracy/golden-check";

export function PoolFreshnessBanner({
  freshness,
  goldenCheck,
}: {
  freshness: PlayerPoolFreshness;
  goldenCheck?: GoldenCheckResult | null;
}) {
  return (
    <div className="space-y-1.5">
      <p className="type-eyebrow text-orange-700">
        {formatPoolFreshnessLabel(freshness)}
      </p>
      <p className="type-caption text-emerald-950/50">
        {freshness.scoringLabel} · current NFL week {freshness.currentWeek}
      </p>
      {freshness.warning && (
        <p
          role="status"
          className="rounded-xl border border-orange-600/30 bg-orange-50/40 px-3 py-2 text-sm text-orange-800"
        >
          {freshness.warning}
        </p>
      )}
      {freshness.latestWeekMissing && !freshness.warning && (
        <p
          role="status"
          className="rounded-xl border border-orange-600/30 bg-orange-50/40 px-3 py-2 text-sm text-orange-800"
        >
          Latest completed week ({freshness.statsThroughWeek}) is not in the
          database yet — not treating older stats as current.
        </p>
      )}
      {goldenCheck && !goldenCheck.ok && (
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          Accuracy check failed ({goldenCheck.failureCount} mismatches vs
          nflverse full-PPR golden sample). First:{" "}
          {goldenCheck.failures[0] ?? "see cron logs"}.
        </p>
      )}
      {freshness.dataIssueCount != null && freshness.dataIssueCount > 0 && (
        <div
          role="alert"
          className="space-y-1 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <p className="font-semibold">
            Data check: {freshness.dataIssueCount} open issue
            {freshness.dataIssueCount === 1 ? "" : "s"}
          </p>
          <ul className="list-inside list-disc text-[13px] leading-snug">
            {(freshness.dataIssueNotices ?? []).slice(0, 5).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
