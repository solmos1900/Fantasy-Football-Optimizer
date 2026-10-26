/**
 * Regression guards for email verification + OAuth takeover fix (#42).
 *
 * Proves:
 * - Register does not create a usable User before the code is entered
 * - Unverified credentials cannot sign in (authorize rules / emailVerified)
 * - Correct code verifies; wrong / expired codes fail
 * - Unverified credentials-only Users are cleared so OAuth is not linked onto them
 * - Source: GitHub dangerous linking disabled; Google uses safe adapter
 *
 * Run: npm run verify:email-auth
 * Requires DATABASE_URL (and a migrated Postgres).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  VERIFICATION_MAX_ATTEMPTS,
  clearUnverifiedCredentialsBlocker,
  codesMatch,
  generateVerificationCode,
  hashVerificationCode,
  startEmailVerificationChallenge,
  verifyEmailCode,
} from "../src/lib/auth/email-verification";
import { hashPassword } from "../src/lib/password";

config({ path: path.join(process.cwd(), ".env") });

if (!process.env.DATABASE_URL) {
  throw new Error("verify:email-auth requires DATABASE_URL");
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "verify-email-auth-test-secret-32b";
}
// Force console email provider so tests do not depend on Resend/domain allowlists.
delete process.env.RESEND_API_KEY;
process.env.AUTH_EMAIL_DEV_EXPOSE_CODE = "true";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const victimEmail = `victim-${suffix}@example.com`;
const attackerPassword = "attacker-pass-123";

async function cleanup() {
  await prisma.emailVerificationChallenge
    .deleteMany({ where: { email: victimEmail } })
    .catch(() => {});
  await prisma.user.deleteMany({ where: { email: victimEmail } }).catch(() => {});
}

async function main() {
  // ── Source contract (always) ───────────────────────────────────────────
  const authSrc = fs.readFileSync(
    path.join(process.cwd(), "src/lib/auth.ts"),
    "utf8",
  );
  assert.match(authSrc, /createSafePrismaAdapter/);
  assert.match(authSrc, /!user\.emailVerified/);
  // GitHub must not allow dangerous linking (#68: omit the flag / Auth.js default).
  // Keep compatible with verify:auth-linking — do not require an explicit `false`.
  const githubBlock = authSrc.match(/GitHub\(\{[\s\S]*?\}\),\s*\)/);
  assert.ok(githubBlock, "expected GitHub provider config in auth.ts");
  assert.doesNotMatch(
    githubBlock[0],
    /allowDangerousEmailAccountLinking:\s*true/,
    "GitHub must not enable allowDangerousEmailAccountLinking",
  );
  assert.match(
    githubBlock[0],
    /Do NOT enable allowDangerousEmailAccountLinking for GitHub/,
  );
  assert.match(authSrc, /clearUnverifiedCredentialsBlocker/);

  const registerSrc = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/auth/register/route.ts"),
    "utf8",
  );
  assert.match(registerSrc, /startEmailVerificationChallenge/);
  assert.doesNotMatch(registerSrc, /prisma\.user\.create/);

  const adapterSrc = fs.readFileSync(
    path.join(process.cwd(), "src/lib/auth/safe-adapter.ts"),
    "utf8",
  );
  assert.match(adapterSrc, /getUserByEmail/);
  assert.match(adapterSrc, /clearUnverifiedCredentialsBlocker/);

  // ── Pure code hashing ──────────────────────────────────────────────────
  const code = generateVerificationCode();
  assert.match(code, /^\d{6}$/);
  const hashed = hashVerificationCode(code);
  assert.notEqual(hashed, code);
  assert.equal(codesMatch(code, hashed), true);
  assert.equal(codesMatch("000000", hashed), code === "000000");

  await cleanup();

  // ── Register does not create a User ────────────────────────────────────
  process.env.AUTH_EMAIL_DEV_EXPOSE_CODE = "true";
  const started = await startEmailVerificationChallenge({
    email: victimEmail,
    password: attackerPassword,
    name: "Attacker",
  });
  assert.equal(started.ok, true);
  if (!started.ok) throw new Error("unreachable");
  assert.ok(started.devCode);

  const userAfterRegister = await prisma.user.findUnique({
    where: { email: victimEmail },
  });
  assert.equal(
    userAfterRegister,
    null,
    "register must not create a User before verification",
  );

  const challenge = await prisma.emailVerificationChallenge.findUnique({
    where: { email: victimEmail },
  });
  assert.ok(challenge);
  assert.notEqual(challenge!.codeHash, started.devCode);

  // Wrong code fails; still no User
  const wrong = await verifyEmailCode({
    email: victimEmail,
    code: started.devCode === "000000" ? "111111" : "000000",
    password: attackerPassword,
  });
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.status, 401);
  assert.equal(await prisma.user.findUnique({ where: { email: victimEmail } }), null);

  // Expired code fails
  await prisma.emailVerificationChallenge.update({
    where: { email: victimEmail },
    data: { expiresAt: new Date(Date.now() - 1000), attemptCount: 0 },
  });
  const expired = await verifyEmailCode({
    email: victimEmail,
    code: started.devCode,
    password: attackerPassword,
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.status, 410);

  // Fresh code succeeds → User with emailVerified
  const restarted = await startEmailVerificationChallenge({
    email: victimEmail,
    password: attackerPassword,
    name: "Attacker",
  });
  // May 429 if cooldown — force-update code if needed
  let goodCode: string;
  if (restarted.ok && restarted.devCode) {
    goodCode = restarted.devCode;
  } else {
    goodCode = generateVerificationCode();
    await prisma.emailVerificationChallenge.update({
      where: { email: victimEmail },
      data: {
        codeHash: hashVerificationCode(goodCode),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attemptCount: 0,
        lastSentAt: new Date(0),
      },
    });
  }

  const verified = await verifyEmailCode({
    email: victimEmail,
    code: goodCode,
    password: attackerPassword,
  });
  assert.equal(verified.ok, true);
  const user = await prisma.user.findUnique({ where: { email: victimEmail } });
  assert.ok(user?.passwordHash);
  assert.ok(user?.emailVerified);
  assert.equal(user?.isGuest, false);

  // Challenge consumed
  assert.equal(
    await prisma.emailVerificationChallenge.findUnique({
      where: { email: victimEmail },
    }),
    null,
  );

  // Replayed / missing challenge fails
  const replay = await verifyEmailCode({
    email: victimEmail,
    code: goodCode,
    password: attackerPassword,
  });
  assert.equal(replay.ok, false);

  // ── #152: a later register can't swap a pending signup's password ──────
  await cleanup();
  const victimPassword = "victim-pass-12345";
  const victimStart = await startEmailVerificationChallenge({
    email: victimEmail,
    password: victimPassword,
  });
  assert.equal(victimStart.ok, true);
  if (!victimStart.ok || !victimStart.devCode) throw new Error("unreachable");
  // Attacker re-registers after the resend cooldown with a different password.
  await prisma.emailVerificationChallenge.update({
    where: { email: victimEmail },
    data: { lastSentAt: new Date(0) },
  });
  const hijack = await startEmailVerificationChallenge({
    email: victimEmail,
    password: attackerPassword,
  });
  assert.equal(hijack.ok, false);
  if (!hijack.ok) assert.equal(hijack.status, 409);
  // A code alone is not enough: the verifier must know the signup password.
  const wrongPw = await verifyEmailCode({
    email: victimEmail,
    code: victimStart.devCode,
    password: attackerPassword,
  });
  assert.equal(wrongPw.ok, false);
  assert.equal(await prisma.user.findUnique({ where: { email: victimEmail } }), null);
  const rightPw = await verifyEmailCode({
    email: victimEmail,
    code: victimStart.devCode,
    password: victimPassword,
  });
  assert.equal(rightPw.ok, true);
  const victimUser = await prisma.user.findUnique({ where: { email: victimEmail } });
  const { verifyPassword } = await import("../src/lib/password");
  assert.equal(await verifyPassword(victimPassword, victimUser!.passwordHash!), true);
  assert.equal(await verifyPassword(attackerPassword, victimUser!.passwordHash!), false);

  // ── Legacy unverified blocker is cleared for OAuth ─────────────────────
  await cleanup();
  const legacy = await prisma.user.create({
    data: {
      email: victimEmail,
      name: "Legacy Attacker",
      passwordHash: await hashPassword(attackerPassword),
      emailVerified: null,
      isGuest: false,
    },
  });
  assert.equal(legacy.emailVerified, null);

  const cleared = await clearUnverifiedCredentialsBlocker(victimEmail);
  assert.equal(cleared, true);
  assert.equal(await prisma.user.findUnique({ where: { email: victimEmail } }), null);

  // Verified users are NOT cleared
  const verifiedUser = await prisma.user.create({
    data: {
      email: victimEmail,
      name: "Real Owner",
      passwordHash: await hashPassword("real-owner-pass"),
      emailVerified: new Date(),
      isGuest: false,
    },
  });
  assert.equal(await clearUnverifiedCredentialsBlocker(victimEmail), false);
  assert.ok(await prisma.user.findUnique({ where: { id: verifiedUser.id } }));

  // Attempt limit constant is enforced in source
  assert.ok(VERIFICATION_MAX_ATTEMPTS >= 3);

  // ── Email env + fail-closed delivery ───────────────────────────────────
  const sendSrc = fs.readFileSync(
    path.join(process.cwd(), "src/lib/email/send.ts"),
    "utf8",
  );
  assert.match(sendSrc, /process\.env\.RESEND_API_KEY/);
  assert.match(sendSrc, /process\.env\.EMAIL_FROM/);
  assert.match(sendSrc, /resolveEmailFrom/);
  assert.match(sendSrc, /RESEND_API_KEY is missing/);

  const { sendEmail, resolveEmailFrom } = await import("../src/lib/email/send");
  process.env.EMAIL_FROM = "Gridiron IQ <onboarding@resend.dev>";
  assert.equal(resolveEmailFrom(), "Gridiron IQ <onboarding@resend.dev>");

  // Deployed without key must fail clearly (not console-ok).
  const prevVercel = process.env.VERCEL;
  const prevVercelEnv = process.env.VERCEL_ENV;
  delete process.env.RESEND_API_KEY;
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  const missingKey = await sendEmail({
    to: "anyone@example.com",
    subject: "t",
    text: "t",
  });
  assert.equal(missingKey.ok, false);
  if (!missingKey.ok) {
    assert.match(missingKey.error, /couldn'?t send|not configured/i);
  }
  if (prevVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = prevVercel;
  if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = prevVercelEnv;

  // Login UI must surface a plain note when deliveryFailed is set.
  const loginSrc = fs.readFileSync(
    path.join(process.cwd(), "src/components/login-actions.tsx"),
    "utf8",
  );
  assert.match(loginSrc, /deliveryFailed/);
  assert.match(loginSrc, /couldn'?t email your verification code/i);

  await cleanup();
  console.log("verify-email-auth: ok");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(() => {});
    await prisma.$disconnect();
  });
