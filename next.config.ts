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
  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
