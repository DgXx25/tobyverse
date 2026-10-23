import path from "path";
import { fileURLToPath } from "url";
import nextConstants from "next/constants.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const { PHASE_DEVELOPMENT_SERVER } = nextConstants;

// Turbopack `next dev` and webpack `next build` cannot share `.next` on Windows.
const firebaseAuthHelperHost = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`
  : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const requestedBuildCpus = Number(process.env.NEXT_BUILD_CPUS);

/** @type {import("next").NextConfig} */
const createNextConfig = (phase) => {
  const isDevelopmentServer = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    distDir: isDevelopmentServer ? ".next-dev" : ".next",
    outputFileTracingRoot: root,
    outputFileTracingIncludes: { "/api/chat": ["./lib/skills/library/*/SKILL.md"] },
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
      ...(Number.isInteger(requestedBuildCpus) && requestedBuildCpus > 0
        ? { cpus: requestedBuildCpus }
        : {}),
      optimizePackageImports: [
        "lucide-react",
        "@hugeicons/react",
        "@hugeicons/core-free-icons",
        "motion",
        "firebase/firestore",
        "firebase/auth",
        "firebase/app",
      ],
      middlewareClientMaxBodySize: "202mb",
      serverActions: {
        bodySizeLimit: "202mb",
      },
    },
    async rewrites() {
      if (isDevelopmentServer) {
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
};

export default createNextConfig;
