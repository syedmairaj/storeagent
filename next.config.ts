import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hide Next.js Dev Tools / "Insight" indicator during local review captures.
  // Compile/runtime errors still surface via the error overlay.
  devIndicators: false,
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
