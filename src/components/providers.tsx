"use client";

import { SessionProvider } from "next-auth/react";
import { InstallAppExperience } from "@/components/install-app";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <InstallAppExperience />
    </SessionProvider>
  );
}
