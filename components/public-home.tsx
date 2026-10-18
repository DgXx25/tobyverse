"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { enterAppAfterSignIn, isAccountUser, persistSignedInSession } from "@/lib/auth";

const LandingPreview = dynamic(() => import("@/components/landing-preview").then((mod) => mod.LandingPreview));

export function PublicHome({ sessionHint = false }: { sessionHint?: boolean }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const sent = useRef(false);
  const account = isAccountUser(user);
  const restoring = loading && sessionHint;

  useEffect(() => {
    if (sent.current || !isAccountUser(user)) return;
    sent.current = true;
    persistSignedInSession(user);
    enterAppAfterSignIn(true, (path) => router.replace(path));
  }, [user, router]);

  if (account || restoring) {
    return <div className="min-h-dvh bg-[#0a0a0a]" />;
  }

  return <LandingPreview />;
}
