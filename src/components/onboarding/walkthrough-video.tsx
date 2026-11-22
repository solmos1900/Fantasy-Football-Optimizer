"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Absolute path or full URL. Empty / missing file → renders nothing. */
  src: string | null | undefined;
  title?: string;
  className?: string;
};

/**
 * Loads a walkthrough screen recording when the asset exists.
 * Never invents video content — renders nothing on miss/error.
 */
export function WalkthroughVideo({
  src,
  title = "Walkthrough video",
  className,
}: Props) {
  const url = src?.trim() ?? "";
  const isRemote = /^https?:\/\//i.test(url);
  // Result of the probe / <video> error, keyed by the URL it applies to so a
  // new src starts from "loading" without a synchronous reset in an effect.
  const [probe, setProbe] = useState<{
    url: string;
    status: "ready" | "missing";
  } | null>(null);
  const probed = probe?.url === url ? probe.status : null;
  const status: "loading" | "ready" | "missing" = !url
    ? "missing"
    : (probed ?? (isRemote ? "ready" : "loading"));
  const setStatus = (next: "ready" | "missing") => setProbe({ url, status: next });

  useEffect(() => {
    // Remote URLs go straight to <video> and rely on onError.
    if (!url || isRemote) return;

    let cancelled = false;
    const report = (next: "ready" | "missing") => {
      if (!cancelled) setProbe({ url, status: next });
    };

    // Prefer a 1-byte Range GET — Next.dev HEAD on missing public files can hang.
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);

    void fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!(res.ok || res.status === 206)) {
          report("missing");
          return;
        }
        const buf = await res.arrayBuffer();
        // Zero-byte stubs count as missing.
        report(buf.byteLength > 0 ? "ready" : "missing");
      })
      .catch(() => report("missing"))
      .finally(() => {
        window.clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [url, isRemote]);

  // No video (or it failed to load): show nothing rather than a
  // "coming soon" box in front of users.
  if (status === "missing" || !src?.trim()) return null;

  if (status === "loading") {
    return (
      <div
        className={cn(
          "flex aspect-video w-full items-center justify-center rounded-lg border border-white/10 bg-[#141414]",
          className,
        )}
        aria-busy
      >
        <p className="text-xs text-white/45">Checking for walkthrough…</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-white/10 bg-black",
        className,
      )}
    >
      <video
        className="aspect-video w-full bg-black"
        controls
        playsInline
        preload="metadata"
        title={title}
        src={src.trim()}
        onError={() => setStatus("missing")}
      >
        <track kind="captions" />
      </video>
    </div>
  );
}
