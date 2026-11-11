/**
 * Browser-side feature-usage tracking. Fire-and-forget: failures are ignored
 * and never affect the UI. Names must be in CLIENT_ANALYTICS_EVENTS.
 */

export type ClientAnalyticsEvent =
  | "trade_analyzed"
  | "who_to_start_compared"
  | "chat_template_used";

export function trackClientEvent(
  name: ClientAnalyticsEvent,
  props?: Record<string, string | number | boolean | null>,
): void {
  try {
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics never breaks the page.
  }
}
