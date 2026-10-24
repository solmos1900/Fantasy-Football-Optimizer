import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { deleteGuestUserById } from "@/lib/cleanup/ephemeral";
import { createSafePrismaAdapter } from "@/lib/auth/safe-adapter";
import { clearUnverifiedCredentialsBlocker } from "@/lib/auth/email-verification";

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

if (!authSecret) {
  console.error(
    "[auth] AUTH_SECRET is missing. Set AUTH_SECRET (openssl rand -base64 32) in the environment. On Vercel: Project → Settings → Environment Variables.",
  );
} else if (authSecret.length < 16) {
  console.error(
    "[auth] AUTH_SECRET is set but looks too short. Use a strong value from: openssl rand -base64 32",
  );
}

/** Accept Auth.js and common alternate env names for OAuth. */
function oauthEnv(primary: string, ...aliases: string[]): string | undefined {
  const keys = [primary, ...aliases];
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

const googleId = oauthEnv("AUTH_GOOGLE_ID", "GOOGLE_CLIENT_ID");
const googleSecret = oauthEnv("AUTH_GOOGLE_SECRET", "GOOGLE_CLIENT_SECRET");
const githubId = oauthEnv("AUTH_GITHUB_ID", "GITHUB_ID");
const githubSecret = oauthEnv("AUTH_GITHUB_SECRET", "GITHUB_SECRET");

export const googleOAuthConfigured = Boolean(googleId && googleSecret);
export const githubOAuthConfigured = Boolean(githubId && githubSecret);

const providers: Provider[] = [];

if (googleOAuthConfigured) {
  providers.push(
    Google({
      clientId: googleId!,
      clientSecret: googleSecret!,
      // Always show Google's account picker so sign-out → sign-in does not
      // silently reuse the previously chosen Google account.
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
      // Safe only because createSafePrismaAdapter clears unverified
      // credentials-only blockers, and email/password Users are not created
      // until the verification code succeeds (emailVerified set).
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (githubOAuthConfigured) {
  providers.push(
    GitHub({
      clientId: githubId!,
      clientSecret: githubSecret!,
      // Do NOT enable allowDangerousEmailAccountLinking for GitHub.
      // Unlike Google, GitHub does not always guarantee the returned email
      // is verified for the signing-in user, so silent email-based account
      // merge would enable takeover. Prefer Auth.js default (no auto-link)
      // so GitHub accounts are only linked via explicit signed-in linking.
      // Also reject unverified GitHub emails in the signIn callback below.
    }),
  );
}

// Email / password — works without OAuth secrets
providers.push(
  Credentials({
    id: "credentials",
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!authSecret) {
        console.error("[auth] Credentials sign-in rejected: AUTH_SECRET is not configured.");
        return null;
      }

      const email =
        typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
      const password =
        typeof credentials?.password === "string" ? credentials.password : "";

      if (!email || !password) return null;

      try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || user.isGuest) return null;

        // Unverified password accounts must not be usable (and must not sit
        // around as OAuth link targets — see createSafePrismaAdapter).
        if (!user.emailVerified) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isGuest: false,
        };
      } catch (error) {
        console.error(
          "[auth] Credentials sign-in failed talking to the database. Ensure DATABASE_URL points at Postgres and migrations have been applied.",
          error,
        );
        return null;
      }
    },
  }),
);

// Guest mode — temporary user, no OAuth secrets required
providers.push(
  Credentials({
    id: "guest",
    name: "Guest",
    credentials: {
      name: { label: "Name", type: "text" },
    },
    async authorize(credentials) {
      if (!authSecret) {
        console.error("[auth] Guest sign-in rejected: AUTH_SECRET is not configured.");
        return null;
      }

      const displayName =
        typeof credentials?.name === "string" && credentials.name.trim().length > 0
          ? credentials.name.trim().slice(0, 48)
          : "Guest";

      try {
        const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const email = `guest-${suffix}@guest.local`;

        const user = await prisma.user.create({
          data: {
            email,
            name: displayName,
            isGuest: true,
            image: null,
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isGuest: true,
        };
      } catch (error) {
        console.error(
          "[auth] Guest sign-in failed talking to the database. Ensure DATABASE_URL points at Postgres and migrations have been applied.",
          error,
        );
        return null;
      }
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,
  adapter: createSafePrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  events: {
    // Backup for guest wipe when sign-out bypasses /api/guest/end-session
    // (e.g. Auth.js default signOut). JWT strategy → message.token.
    async signOut(message) {
      const token =
        message && typeof message === "object" && "token" in message
          ? (message as { token?: { sub?: string; isGuest?: boolean } }).token
          : undefined;
      if (!token?.sub || !token.isGuest) return;
      try {
        await deleteGuestUserById(token.sub);
      } catch (err) {
        console.error("[auth] guest cleanup on signOut failed", err);
      }
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Credentials / guest: authorize() already enforced verification.
      if (!account || account.provider === "credentials" || account.provider === "guest") {
        return true;
      }

      const email =
        (typeof user.email === "string" && user.email) ||
        (profile && typeof (profile as { email?: string }).email === "string"
          ? (profile as { email: string }).email
          : null);

      // Drop any leftover unverified password-only User so OAuth is not linked
      // onto an attacker's pre-registered row (legacy rows + race safety).
      await clearUnverifiedCredentialsBlocker(email);

      // GitHub: require a verified email from the provider when present.
      if (account.provider === "github" && profile) {
        const gh = profile as { email?: string; email_verified?: boolean };
        if (gh.email && gh.email_verified === false) {
          return false;
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.isGuest = Boolean(
          (user as { isGuest?: boolean }).isGuest ?? false,
        );
      } else if (token.sub && token.isGuest === undefined) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { isGuest: true },
          });
          token.isGuest = dbUser?.isGuest ?? false;
        } catch {
          token.isGuest = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.isGuest = Boolean(token.isGuest);
      }
      return session;
    },
  },
});
