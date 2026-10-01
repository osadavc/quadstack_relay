import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  output: "standalone",
  // Lets several dev servers run side by side from one checkout.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: join(__dirname, "../.."),
  transpilePackages: ["@relay/db", "@relay/domain", "@relay/engine"],
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      {
        // The driver's offline worker must never be cached by the browser.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
