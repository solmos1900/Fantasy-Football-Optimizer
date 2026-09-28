/**
 * Route-transition placeholder for app chrome.
 * Lean Sanity pulse only — no cork-board / draft-board art (PWA first paint).
 * Top brand progress strip lives in NavigationProgress.
 */
export default function AppLoading() {
  return (
    <div
      className="flex min-h-[42vh] flex-col items-center justify-center gap-3"
      aria-busy="true"
      aria-label="Loading page"
    >
      <span
        className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand shadow-[0_0_14px_rgba(192,38,255,0.55)]"
        aria-hidden
      />
      <span className="type-caption text-emerald-950/45">Loading…</span>
    </div>
  );
}
