/**
 * Shared throttles for sign-in surfaces (Postgres-backed, cross-instance).
 *
 * - Password sign-in: per email and per IP (slows credential stuffing).
 * - Guest creation: per IP (each guest used to mint a fresh AI chat quota).
 */

import {
  clientIpFromRequest,
  hashedKeyPart,
  rateLimit,
} from "@/lib/http/rate-limit";

const FIFTEEN_MIN = 15 * 60_000;
const ONE_HOUR = 60 * 60_000;
const ONE_DAY = 24 * ONE_HOUR;

export const LOGIN_LIMIT_PER_EMAIL = 10;
export const LOGIN_LIMIT_PER_IP = 40;
export const GUEST_LIMIT_PER_IP_HOUR = 5;
export const GUEST_LIMIT_PER_IP_DAY = 15;

export function requestIp(request: Request | undefined): string {
  if (!request?.headers) return "unknown";
  return clientIpFromRequest(request);
}

/** True when this password attempt is allowed. Counts every attempt. */
export async function allowLoginAttempt(
  email: string,
  ip: string,
): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    rateLimit({
      key: `login:email:${hashedKeyPart(email)}`,
      limit: LOGIN_LIMIT_PER_EMAIL,
      windowMs: FIFTEEN_MIN,
    }),
    rateLimit({
      key: `login:ip:${hashedKeyPart(ip)}`,
      limit: LOGIN_LIMIT_PER_IP,
      windowMs: FIFTEEN_MIN,
    }),
  ]);
  return byEmail.ok && byIp.ok;
}

/** True when this IP may create another guest user. */
export async function allowGuestCreation(ip: string): Promise<boolean> {
  const key = hashedKeyPart(ip);
  const [hour, day] = await Promise.all([
    rateLimit({
      key: `guest-create:ip:${key}`,
      limit: GUEST_LIMIT_PER_IP_HOUR,
      windowMs: ONE_HOUR,
    }),
    rateLimit({
      key: `guest-create-day:ip:${key}`,
      limit: GUEST_LIMIT_PER_IP_DAY,
      windowMs: ONE_DAY,
    }),
  ]);
  return hour.ok && day.ok;
}
