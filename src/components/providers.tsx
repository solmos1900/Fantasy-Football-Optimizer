"use client";

import { SessionProvider } from "next-auth/react";
import { InstallAppExperience } from "@/components/install-app";
import { ScrollToTop } from "@/components/scroll-to-top";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ScrollToTop />
      {children}
      <InstallAppExperience />
    </SessionProvider>
  );
}
