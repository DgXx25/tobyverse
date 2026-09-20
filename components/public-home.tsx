"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LandingScreen } from "@/components/landing-screen";
import { enterAppAfterSignIn, isAccountUser, persistSignedInSession } from "@/lib/auth";

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

  return <LandingScreen />;
}
