"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

function resetWindowScroll() {
  if (typeof window === "undefined") return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/**
 * App Router does not always reset scroll after client redirects (e.g. post-login
 * router.replace). Force top-of-page on every pathname change and disable the
 * browser's automatic scroll restoration that can reopen mid-page.
 */
export function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    if ("scrollRestoration" in history) {
      const prev = history.scrollRestoration;
      history.scrollRestoration = "manual";
      return () => {
        history.scrollRestoration = prev;
      };
    }
  }, []);

  useLayoutEffect(() => {
    resetWindowScroll();
  }, [pathname]);

  return null;
}

export function scrollToTopNow() {
  resetWindowScroll();
}
