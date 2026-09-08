import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["unpdf", "mammoth", "jszip"],
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
  experimental: {
    middlewareClientMaxBodySize: "16mb",
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
