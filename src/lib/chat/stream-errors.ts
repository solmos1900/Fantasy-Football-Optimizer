import { CHAT_BUSY_NOTICE, CHAT_GATEWAY_UNAVAILABLE_NOTICE } from "@/lib/chat/config";

/**
 * Error text sent down the UI stream when the model call fails mid-turn. The
 * client shows `notice`; rate limits read as "busy", anything else as
 * unavailable (instead of the SDK's default "An error occurred.").
 */
export function streamErrorText(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  const busy =
    /RateLimit|TooManyRequests/i.test(name) ||
    /rate limit|\b429\b|too many requests/i.test(message);
  return JSON.stringify({
    error: busy ? "gateway_busy" : "gateway_unavailable",
    notice: busy ? CHAT_BUSY_NOTICE : CHAT_GATEWAY_UNAVAILABLE_NOTICE,
  });
}
