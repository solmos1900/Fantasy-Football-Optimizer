import { NextResponse } from "next/server";
import {
  clientIpFromRequest,
  hashedKeyPart,
  rateLimit,
  type RateLimitResult,
} from "@/lib/http/rate-limit";

export function tooManyRequests(
  result: RateLimitResult,
  message = "Too many requests. Try again shortly.",
): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
        ),
      },
    },
  );
}

/** Apply a per-IP rate limit; returns a 429 Response when exceeded. */
export async function enforceRateLimit(
  request: Request,
  options: { bucket: string; limit: number; windowMs: number },
): Promise<NextResponse | null> {
  const ip = clientIpFromRequest(request);
  const result = await rateLimit({
    key: `${options.bucket}:ip:${hashedKeyPart(ip)}`,
    limit: options.limit,
    windowMs: options.windowMs,
  });
  if (result.ok) return null;
  return tooManyRequests(result);
}
