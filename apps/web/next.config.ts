import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@claude-remote/core"],
  serverExternalPackages: ["better-sqlite3", "pino"],
};

export default nextConfig;
