/**
 * Optional Cloudflare Turnstile check for guest sign-in and sign-up.
 *
 * Enabled only when TURNSTILE_SECRET_KEY is set (pair it with
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY so the widget renders). Without the keys
 * this is a no-op and the per-IP throttles in `auth-throttle.ts` still apply.
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function botCheckEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY?.trim());
}

export async function verifyBotCheck(
  token: unknown,
  ip: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (typeof token !== "string" || !token.trim()) return false;

  const body = new URLSearchParams({ secret, response: token.trim() });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    // Fail closed: a bot check that cannot be verified is not a pass.
    console.error("[bot-check] Turnstile verification failed", err);
    return false;
  }
}
