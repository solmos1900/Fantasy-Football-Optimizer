"use client";

import { useEffect, useState } from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Absolute path or full URL. Empty / missing file → honest placeholder. */
  src: string | null | undefined;
  title?: string;
  className?: string;
};

/**
 * Loads a walkthrough screen recording when the asset exists.
 * Never invents video content — shows a clean placeholder on miss/error.
 */
export function WalkthroughVideo({
  src,
  title = "Walkthrough video",
  className,
}: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(
    src?.trim() ? "loading" : "missing",
  );

  useEffect(() => {
    const url = src?.trim();
    if (!url) {
      setStatus("missing");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    // HEAD probe for same-origin public assets; remote URLs fall through to <video>.
    const isRemote = /^https?:\/\//i.test(url);
    if (isRemote) {
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);

    void fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        if (cancelled) return;
        // Zero-byte stubs (or missing) must show the honest placeholder — never
        // pretends a walkthrough exists.
        const length = Number(res.headers.get("content-length") ?? "0");
        const ok = res.ok && length > 0;
        setStatus(ok ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      })
      .finally(() => {
        window.clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [src]);

  if (status === "missing" || !src?.trim()) {
    return (
      <div
        className={cn(
          "flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-[#141414] px-4 text-center",
          className,
        )}
        role="img"
        aria-label="Walkthrough video coming soon"
      >
        <Film className="h-7 w-7 text-[#C026FF]/70" aria-hidden />
        <p className="text-sm font-medium text-white/90">
          Walkthrough video coming soon
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-white/45">
          A computer + Safari recording will play here once the file is added.
        </p>
      </div>
    );
  }

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
