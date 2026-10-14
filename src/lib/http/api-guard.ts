import { NextResponse } from "next/server";
import { clientIpFromRequest, rateLimit } from "@/lib/http/rate-limit";

/** Apply a per-IP rate limit; returns a 429 Response when exceeded. */
export function enforceRateLimit(
  request: Request,
  options: { bucket: string; limit: number; windowMs: number },
): NextResponse | null {
  const ip = clientIpFromRequest(request);
  const result = rateLimit({
    key: `${options.bucket}:${ip}`,
    limit: options.limit,
    windowMs: options.windowMs,
  });
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Try again shortly." },
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
