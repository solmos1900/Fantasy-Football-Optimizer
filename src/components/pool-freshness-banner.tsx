import {
  formatPoolFreshnessLabel,
  type PlayerPoolFreshness,
} from "@/lib/players/pool";

export function PoolFreshnessBanner({
  freshness,
}: {
  freshness: PlayerPoolFreshness;
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
    </div>
  );
}
