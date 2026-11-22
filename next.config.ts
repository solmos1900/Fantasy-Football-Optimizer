import type { NextConfig } from "next";

/**
 * Baseline security headers on every response. Deliberately no script CSP
 * (would need nonces for Next + Turnstile); `frame-ancestors` only blocks
 * other sites from embedding the app (clickjacking).
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // Keep server actions available for future form posts
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
