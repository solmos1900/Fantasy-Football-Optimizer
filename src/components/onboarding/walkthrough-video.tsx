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

    // Prefer a 1-byte Range GET — Next.dev HEAD on missing public files can hang.
    // Remote URLs fall through to <video> and use onError.
    const isRemote = /^https?:\/\//i.test(url);
    if (isRemote) {
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);

    void fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!(res.ok || res.status === 206)) {
          setStatus("missing");
          return;
        }
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        // Zero-byte stubs must show the honest placeholder.
        setStatus(buf.byteLength > 0 ? "ready" : "missing");
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
