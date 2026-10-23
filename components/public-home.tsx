"use client";

import dynamic from "next/dynamic";

const LandingPreview = dynamic(() => import("@/components/landing-preview").then((mod) => mod.LandingPreview));
const AuthenticatedPublicHome = dynamic(
  () => import("@/components/public-home-auth").then((mod) => mod.AuthenticatedPublicHome),
  { loading: () => <div className="min-h-dvh bg-[#0a0a0a]" /> },
);

export function PublicHome({ sessionHint = false }: { sessionHint?: boolean }) {
  return sessionHint ? <AuthenticatedPublicHome /> : <LandingPreview />;
}
