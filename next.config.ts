import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // Force the browser bundle (no react-native-fs) even in server API routes
      alasql: path.resolve("./node_modules/alasql/dist/alasql.min.js"),
    },
  },
  webpack: (config) => {
    config.resolve.alias["alasql"] = path.resolve(
      "./node_modules/alasql/dist/alasql.min.js"
    );
    return config;
  },
};

export default nextConfig;
