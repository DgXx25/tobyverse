import type { NextConfig } from "next";
import path from "path";

// Turbopack `next dev` and webpack `next build` cannot share `.next` on Windows.
const distDir =
  process.env.NEXT_DIST_DIR || (process.argv.includes("dev") ? ".next-dev" : ".next");
process.env.NEXT_DIST_DIR ??= distDir;

const firebaseAuthHelperHost = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`
  : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

const nextConfig: NextConfig = {
  distDir,
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
    optimizePackageImports: ["lucide-react"],
    middlewareClientMaxBodySize: "202mb",
    serverActions: {
      bodySizeLimit: "202mb",
    },
  },
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [{ source: "/__/auth/handler", destination: "/login/google-callback" }];
    }
    if (!firebaseAuthHelperHost) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${firebaseAuthHelperHost}/__/auth/:path*`,
      },
    ];
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
