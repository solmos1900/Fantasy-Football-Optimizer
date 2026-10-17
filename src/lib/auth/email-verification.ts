import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, isValidEmail, isValidPassword } from "@/lib/password";
import { sendVerificationCodeEmail } from "@/lib/email/send";

/** 6-digit numeric codes — short enough to type, long enough with attempt limits. */
export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_TTL_MS = 15 * 60 * 1000;
export const VERIFICATION_MAX_ATTEMPTS = 5;
/** Minimum gap between resends for the same email. */
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export type ChallengeStartResult =
  | {
      ok: true;
      email: string;
      /** Only present in local/dev when AUTH_EMAIL_DEV_EXPOSE_CODE=true (or console provider). */
      devCode?: string;
    }
  | { ok: false; error: string; status: number };

export type ChallengeVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number };

function codePepper(): string {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-pepper";
}

/** Hash a plaintext code for at-rest storage (pepper + sha256). */
export function hashVerificationCode(code: string): string {
  return createHash("sha256")
    .update(`${codePepper()}:${code.trim()}`)
    .digest("hex");
}

export function generateVerificationCode(): string {
  const max = 10 ** VERIFICATION_CODE_LENGTH;
  return String(randomInt(0, max)).padStart(VERIFICATION_CODE_LENGTH, "0");
}

export function codesMatch(plain: string, codeHash: string): boolean {
  const a = hashVerificationCode(plain);
  // timing-safe compare
  if (a.length !== codeHash.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ codeHash.charCodeAt(i);
  return diff === 0;
}

function shouldExposeDevCode(provider: "resend" | "console" | undefined): boolean {
  if (process.env.AUTH_EMAIL_DEV_EXPOSE_CODE === "true") return true;
  if (process.env.NODE_ENV === "production") return false;
  return provider === "console";
}

/**
 * Start or refresh an email verification challenge for signup / legacy re-verify.
 * Does NOT create a usable User — only a pending challenge row.
 */
export async function startEmailVerificationChallenge(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<ChallengeStartResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || email.split("@")[0];
  const password = input.password;

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return {
      ok: false,
      error: "Provide a valid email and a password of at least 8 characters.",
      status: 400,
    };
  }

  if (email.endsWith("@guest.local")) {
    return {
      ok: false,
      error: "That email domain is reserved for guest sessions.",
      status: 400,
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { accounts: { select: { id: true }, take: 1 } },
  });

  // Fully usable account already exists
  if (existing?.passwordHash && existing.emailVerified) {
    return {
      ok: false,
      error: "An account with that email already exists. Sign in instead.",
      status: 409,
    };
  }
  if (existing && !existing.isGuest && !existing.passwordHash) {
    return {
      ok: false,
      error:
        "An account with that email already exists (likely via Google/GitHub). Sign in with SSO or use a different email.",
      status: 409,
    };
  }
  if (
    existing &&
    !existing.isGuest &&
    existing.accounts.length > 0 &&
    existing.emailVerified
  ) {
    return {
      ok: false,
      error:
        "An account with that email already exists (likely via Google/GitHub). Sign in with SSO or use a different email.",
      status: 409,
    };
  }

  const prior = await prisma.emailVerificationChallenge.findUnique({
    where: { email },
  });
  if (
    prior &&
    Date.now() - prior.lastSentAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS
  ) {
    return {
      ok: false,
      error: "Please wait a minute before requesting another code.",
      status: 429,
    };
  }

  const passwordHash = await hashPassword(password);
  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  await prisma.emailVerificationChallenge.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      codeHash,
      expiresAt,
      attemptCount: 0,
      lastSentAt: new Date(),
    },
    update: {
      name,
      passwordHash,
      codeHash,
      expiresAt,
      attemptCount: 0,
      lastSentAt: new Date(),
    },
  });

  const sendResult = await sendVerificationCodeEmail(email, code);
  if (!sendResult.ok) {
    return {
      ok: false,
      error: "Could not send verification email. Try again shortly.",
      status: 502,
    };
  }

  const result: ChallengeStartResult = { ok: true, email };
  if (shouldExposeDevCode(sendResult.provider)) {
    result.devCode = code;
  }
  return result;
}

/**
 * Resend a code for an existing challenge, or for a legacy unverified password User.
 */
export async function resendEmailVerification(input: {
  email: string;
  /** Required when creating a challenge from a legacy unverified User without an open challenge. */
  password?: string;
}): Promise<ChallengeStartResult> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { ok: false, error: "Provide a valid email.", status: 400 };
  }

  const challenge = await prisma.emailVerificationChallenge.findUnique({
    where: { email },
  });
  const user = await prisma.user.findUnique({ where: { email } });

  if (
    challenge &&
    Date.now() - challenge.lastSentAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS
  ) {
    return {
      ok: false,
      error: "Please wait a minute before requesting another code.",
      status: 429,
    };
  }

  // Refresh existing pending challenge
  if (challenge) {
    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
    await prisma.emailVerificationChallenge.update({
      where: { email },
      data: { codeHash, expiresAt, attemptCount: 0, lastSentAt: new Date() },
    });
    const sendResult = await sendVerificationCodeEmail(email, code);
    if (!sendResult.ok) {
      return {
        ok: false,
        error: "Could not send verification email. Try again shortly.",
        status: 502,
      };
    }
    const result: ChallengeStartResult = { ok: true, email };
    if (shouldExposeDevCode(sendResult.provider)) result.devCode = code;
    return result;
  }

  // Legacy: password user exists but never verified — issue a new challenge
  if (user?.passwordHash && !user.emailVerified && !user.isGuest) {
    const password = input.password;
    if (!password || !isValidPassword(password)) {
      return {
        ok: false,
        error: "Enter your password to resend a verification code.",
        status: 400,
      };
    }
    return startEmailVerificationChallenge({
      email,
      password,
      name: user.name ?? undefined,
    });
  }

  // Do not reveal whether the email is unknown vs already verified
  return {
    ok: false,
    error: "No pending verification for that email. Register again or sign in.",
    status: 404,
  };
}

/**
 * Consume a verification code and create/activate the credentials User.
 */
export async function verifyEmailCode(input: {
  email: string;
  code: string;
}): Promise<ChallengeVerifyResult> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return {
      ok: false,
      error: "Enter the 6-digit code from your email.",
      status: 400,
    };
  }

  const challenge = await prisma.emailVerificationChallenge.findUnique({
    where: { email },
  });
  if (!challenge) {
    return {
      ok: false,
      error: "No pending verification for that email. Register again.",
      status: 404,
    };
  }

  if (challenge.attemptCount >= VERIFICATION_MAX_ATTEMPTS) {
    return {
      ok: false,
      error: "Too many attempts. Request a new code.",
      status: 429,
    };
  }

  if (challenge.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      error: "That code has expired. Request a new one.",
      status: 410,
    };
  }

  if (!codesMatch(code, challenge.codeHash)) {
    await prisma.emailVerificationChallenge.update({
      where: { email },
      data: { attemptCount: { increment: 1 } },
    });
    return { ok: false, error: "Incorrect code. Try again.", status: 401 };
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { accounts: { select: { id: true }, take: 1 } },
  });

  // OAuth already claimed this email — do not attach the attacker's password
  if (existing && !existing.isGuest && existing.accounts.length > 0) {
    await prisma.emailVerificationChallenge.deleteMany({ where: { email } });
    return {
      ok: false,
      error:
        "This email is already signed in with Google/GitHub. Use that provider instead.",
      status: 409,
    };
  }

  if (existing?.passwordHash && existing.emailVerified) {
    await prisma.emailVerificationChallenge.deleteMany({ where: { email } });
    return {
      ok: false,
      error: "An account with that email already exists. Sign in instead.",
      status: 409,
    };
  }

  let userId: string;

  if (existing?.isGuest) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: challenge.name,
        passwordHash: challenge.passwordHash,
        isGuest: false,
        emailVerified: new Date(),
      },
    });
    userId = updated.id;
  } else if (existing?.passwordHash && !existing.emailVerified) {
    // Legacy unverified password account — activate it
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: challenge.name ?? existing.name,
        passwordHash: challenge.passwordHash,
        emailVerified: new Date(),
      },
    });
    userId = updated.id;
  } else {
    const created = await prisma.user.create({
      data: {
        email,
        name: challenge.name,
        passwordHash: challenge.passwordHash,
        isGuest: false,
        emailVerified: new Date(),
      },
    });
    userId = created.id;
  }

  await prisma.emailVerificationChallenge.deleteMany({ where: { email } });

  return { ok: true, userId };
}

/**
 * If an unverified credentials-only User blocks this email, delete it so a
 * real OAuth sign-in can create a clean account (closes legacy takeover path).
 * Returns true when a blocker was removed.
 */
export async function clearUnverifiedCredentialsBlocker(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { accounts: { select: { id: true }, take: 1 } },
  });

  if (!user) return false;
  if (user.isGuest) return false;
  if (user.emailVerified) return false;
  if (!user.passwordHash) return false;
  if (user.accounts.length > 0) return false;

  await prisma.user.delete({ where: { id: user.id } });
  await prisma.emailVerificationChallenge.deleteMany({
    where: { email: normalized },
  });
  console.warn(
    "[auth] Removed unverified credentials-only user blocking OAuth for",
    normalized,
  );
  return true;
}
