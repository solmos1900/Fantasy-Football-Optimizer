import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep server actions available for future form posts
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
