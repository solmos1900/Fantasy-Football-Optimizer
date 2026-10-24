import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmailCode } from "@/lib/auth/email-verification";

const VerifySchema = z.object({
  email: z.string().trim().email().max(160),
  code: z.string().trim().min(4).max(12),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter your email and the 6-digit verification code." },
      { status: 400 },
    );
  }

  try {
    const result = await verifyEmailCode({
      email: parsed.data.email,
      code: parsed.data.code,
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
