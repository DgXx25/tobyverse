import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ["galaxyjs"],
  serverExternalPackages: ["unpdf", "mammoth", "jszip"],
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
  turbopack: {
    resolveAlias: {
      canvas: "./lib/canvas-stub.ts",
    },
  },
  experimental: {
    middlewareClientMaxBodySize: "16mb",
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
