export default function AppLoading() {
  return (
    <div
      className="animate-pulse space-y-8"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="space-y-3">
        <div className="h-3 w-28 rounded bg-emerald-950/10" />
        <div className="h-9 w-52 max-w-full rounded bg-emerald-950/12" />
        <div className="h-4 w-72 max-w-full rounded bg-emerald-950/8" />
      </div>

      <div className="cork-board p-3 sm:p-4">
        <div className="surface-card space-y-4 p-4 sm:p-5">
          <div className="h-5 w-32 rounded bg-emerald-950/10" />
          <div className="space-y-3">
            <div className="h-10 rounded-lg bg-emerald-950/[0.06]" />
            <div className="h-10 rounded-lg bg-emerald-950/[0.06]" />
            <div className="h-10 rounded-lg bg-emerald-950/[0.06]" />
            <div className="h-10 rounded-lg bg-emerald-950/[0.06]" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 pt-2 text-sm text-emerald-950/45">
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-orange-700/30 border-t-orange-700"
          aria-hidden
        />
        Loading…
      </div>
    </div>
  );
}
