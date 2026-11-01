import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next start` cannot serve a standalone build, so only the Docker image asks for one.
  ...(process.env.HALT_STANDALONE_BUILD === "1" ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
