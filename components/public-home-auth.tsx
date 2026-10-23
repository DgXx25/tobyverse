"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { enterAppAfterSignIn, isAccountUser, persistSignedInSession } from "@/lib/auth";

const LandingPreview = dynamic(() => import("@/components/landing-preview").then((mod) => mod.LandingPreview));

export function AuthenticatedPublicHome() {
  return (
    <AuthProvider>
      <AuthenticatedPublicHomeContent />
    </AuthProvider>
  );
}

function AuthenticatedPublicHomeContent() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const sent = useRef(false);
  const account = isAccountUser(user);

  useEffect(() => {
    if (sent.current || !account || !user) return;
    sent.current = true;
    persistSignedInSession(user);
    enterAppAfterSignIn(true, (path) => router.replace(path));
  }, [account, user, router]);

  if (account || loading) {
    return <div className="min-h-dvh bg-[#0a0a0a]" />;
  }

  return <LandingPreview />;
}
