import { NextResponse } from "next/server";
import { z } from "zod";
import { resendEmailVerification } from "@/lib/auth/email-verification";

const ResendSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ResendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a valid email." }, { status: 400 });
  }

  try {
    const result = await resendEmailVerification({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      email: result.email,
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  } catch (error) {
    console.error("[auth/resend-verification] failed", error);
    return NextResponse.json(
      { error: "Could not resend verification email. Try again." },
      { status: 500 },
    );
  }
}
