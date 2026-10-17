import { NextResponse } from "next/server";
import { z } from "zod";
import { startEmailVerificationChallenge } from "@/lib/auth/email-verification";
import { enforceRateLimit } from "@/lib/http/api-guard";

const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    bucket: "register",
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a valid email and a password of at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const result = await startEmailVerificationChallenge({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      needsVerification: true,
      email: result.email,
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  } catch (error) {
    console.error("[auth/register] failed", error);
    return NextResponse.json(
      { error: "Could not start registration. Check DATABASE_URL and try again." },
      { status: 500 },
    );
  }
}
