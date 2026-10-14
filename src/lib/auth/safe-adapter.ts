import type { Adapter } from "@auth/core/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import { clearUnverifiedCredentialsBlocker } from "@/lib/auth/email-verification";

/**
 * Prisma adapter wrap that refuses to auto-link OAuth onto unverified
 * email/password Users. When Auth.js looks up a user by email during OAuth
 * callback, we delete credentials-only unverified blockers and return null so
 * the real owner gets a fresh User instead of merging into an attacker's.
 */
export function createSafePrismaAdapter(client: PrismaClient): Adapter {
  const base = PrismaAdapter(client);

  return {
    ...base,
    async getUserByEmail(email) {
      await clearUnverifiedCredentialsBlocker(email);
      return base.getUserByEmail!(email);
    },
  };
}
