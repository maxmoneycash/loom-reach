import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a parent lockfile exists on the dev machine).
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
