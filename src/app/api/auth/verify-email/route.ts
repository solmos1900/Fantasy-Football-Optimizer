import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, tooManyRequests } from "@/lib/http/api-guard";
import { hashedKeyPart, rateLimit } from "@/lib/http/rate-limit";
import { verifyEmailCode } from "@/lib/auth/email-verification";

const VerifySchema = z.object({
  email: z.string().trim().email().max(160),
  code: z.string().trim().min(4).max(12),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, {
    bucket: "verify-email",
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter your email, password and the 6-digit verification code." },
      { status: 400 },
    );
  }

  // Per-email limit on top of the per-IP one, so guesses spread across many
  // IPs still can't hammer a single pending signup.
  const emailLimit = await rateLimit({
    key: `verify-email:email:${hashedKeyPart(parsed.data.email.toLowerCase())}`,
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!emailLimit.ok) return tooManyRequests(emailLimit);

  try {
    const result = await verifyEmailCode({
      email: parsed.data.email,
      code: parsed.data.code,
      password: parsed.data.password,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth/verify-email] failed", error);
    return NextResponse.json(
      { error: "Could not verify email. Try again." },
      { status: 500 },
    );
  }
}
