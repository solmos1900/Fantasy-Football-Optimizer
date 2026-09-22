import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

if (!authSecret) {
  // Auth.js otherwise surfaces an opaque "server configuration" error page.
  console.error(
    "[auth] AUTH_SECRET is missing. Set AUTH_SECRET (openssl rand -base64 32) in the environment. On Vercel: Project → Settings → Environment Variables.",
  );
} else if (authSecret.length < 16) {
  console.error(
    "[auth] AUTH_SECRET is set but looks too short. Use a strong value from: openssl rand -base64 32",
  );
}

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  );
}

// Always available for local/demo — no OAuth keys required
providers.push(
  Credentials({
    id: "demo",
    name: "Demo",
    credentials: {
      email: { label: "Email", type: "email" },
      name: { label: "Name", type: "text" },
    },
    async authorize(credentials) {
      if (!authSecret) {
        console.error("[auth] Demo sign-in rejected: AUTH_SECRET is not configured.");
        return null;
      }

      const email =
        typeof credentials?.email === "string" && credentials.email.length > 0
          ? credentials.email
          : "sebastian@demo.local";
      const name =
        typeof credentials?.name === "string" && credentials.name.length > 0
          ? credentials.name
          : "Sebastian Demo";

      try {
        const user = await prisma.user.upsert({
          where: { email },
          update: { name },
          create: { email, name, image: null },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      } catch (error) {
        console.error(
          "[auth] Demo sign-in failed talking to the database. Ensure DATABASE_URL points at Postgres (Neon/Vercel Postgres) and migrations have been applied (prisma migrate deploy).",
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
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
