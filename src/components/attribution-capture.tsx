"use client";

import { useEffect } from "react";

const COOKIE = "giq_src";
const MAX_AGE_DAYS = 90;

/**
 * First-touch acquisition source for launch tracking: on the first visit with
 * ?utm_source=… (or ?ref=…), store it (plus ?utm_campaign) in a first-party
 * cookie. Never overwrites an existing value. Server code reads it when a
 * guest or account is created and when a user is marked active.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const source = (params.get("utm_source") ?? params.get("ref") ?? "").trim();
      if (!source) return;
      const campaign = (params.get("utm_campaign") ?? "").trim();
      const value = (campaign ? `${source}:${campaign}` : source).toLowerCase();
      if (!/^[a-z0-9_.-]{1,40}(:[a-z0-9_.-]{1,40})?$/.test(value)) return;
      document.cookie = `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${
        MAX_AGE_DAYS * 24 * 60 * 60
      }; Path=/; SameSite=Lax`;
    } catch {
      // Attribution is best-effort.
    }
  }, []);
  return null;
}
