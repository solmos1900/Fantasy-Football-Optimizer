/**
 * Ops alerts: post failures to a chat webhook so they are seen, not just
 * logged. Set OPS_ALERT_WEBHOOK_URL to a Slack incoming webhook or a Discord
 * webhook URL (both accept the JSON body below). Unset → console only.
 *
 * Alerts are deduped per `dedupeKey` through the shared ApiRateLimit table,
 * so a failing route does not flood the channel.
 */

import { rateLimit } from "@/lib/http/rate-limit";

export type OpsAlert = {
  /** Short headline, e.g. "nflverse cron failed". */
  title: string;
  detail?: string;
  severity?: "error" | "warning";
  /** Same key → at most one alert per window. Defaults to the title. */
  dedupeKey?: string;
};

const DEDUPE_WINDOW_MS = 30 * 60_000;
const MAX_DETAIL_CHARS = 1_500;

export function formatOpsAlert(alert: OpsAlert, env = process.env): string {
  const icon = alert.severity === "warning" ? "⚠️" : "🚨";
  const where = env.VERCEL_ENV ?? env.NODE_ENV ?? "unknown";
  const detail = alert.detail
    ? `\n${alert.detail.slice(0, MAX_DETAIL_CHARS)}`
    : "";
  return `${icon} [Gridiron IQ · ${where}] ${alert.title}${detail}`;
}

export async function sendOpsAlert(alert: OpsAlert): Promise<void> {
  const text = formatOpsAlert(alert);
  console.error(`[ops-alert] ${text}`);

  const url = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!url) return;

  try {
    const gate = await rateLimit({
      key: `ops-alert:${alert.dedupeKey ?? alert.title}`,
      limit: 1,
      windowMs: DEDUPE_WINDOW_MS,
    });
    if (!gate.ok) return;

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Slack reads `text`, Discord reads `content`.
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.error("[ops-alert] webhook delivery failed", err);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
