import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, isValidEmail, isValidPassword } from "@/lib/password";

const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
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

  const email = parsed.data.email.toLowerCase();
  const name = parsed.data.name?.trim() || email.split("@")[0];
  const password = parsed.data.password;

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return NextResponse.json(
      { error: "Provide a valid email and a password of at least 8 characters." },
      { status: 400 },
    );
  }

  if (email.endsWith("@guest.local")) {
    return NextResponse.json(
      { error: "That email domain is reserved for guest sessions." },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      return NextResponse.json(
        { error: "An account with that email already exists. Sign in instead." },
        { status: 409 },
      );
    }
    if (existing && !existing.isGuest) {
      return NextResponse.json(
        {
          error:
            "An account with that email already exists (likely via Google/GitHub). Sign in with SSO or use a different email.",
        },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);

    if (existing?.isGuest) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          isGuest: false,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          isGuest: false,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth/register] failed", error);
    return NextResponse.json(
      { error: "Could not create account. Check DATABASE_URL and try again." },
      { status: 500 },
    );
  }
}
