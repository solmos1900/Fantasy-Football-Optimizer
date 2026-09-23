"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { InstallAppExperience } from "@/components/install-app";
import { NavigationProgress } from "@/components/navigation-progress";
import { ScrollToTop } from "@/components/scroll-to-top";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ScrollToTop />
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {children}
      <InstallAppExperience />
    </SessionProvider>
  );
}
