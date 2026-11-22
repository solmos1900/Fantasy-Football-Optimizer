"use client";

import { useEffect } from "react";

/**
 * Last-resort error screen when the root layout itself fails. Replaces the
 * whole document, so it carries its own <html>/<body> and inline styles
 * (global CSS may not have loaded).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] root error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#141414",
          color: "#f5f5f5",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", color: "rgba(245,245,245,0.65)", lineHeight: 1.5 }}>
            Gridiron IQ hit an unexpected error. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#C026FF",
              color: "#fff",
              border: 0,
              borderRadius: 999,
              padding: "10px 18px",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
