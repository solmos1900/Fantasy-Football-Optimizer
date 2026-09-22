import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isGuest?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    isGuest?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    isGuest?: boolean;
  }
}
