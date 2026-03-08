import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure sql.js WASM file is included in Vercel deployments
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/sql.js/dist/**/*.wasm"],
  },
  // Acknowledge Turbopack as the bundler (no webpack-specific config needed —
  // sql.js WASM is loaded at runtime via locateFile pointing to node_modules)
  turbopack: {},
};

export default nextConfig;
