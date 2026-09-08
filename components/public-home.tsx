"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth-provider";
import { LandingScreen } from "@/components/landing-screen";
import { enterAppAfterSignIn, isAccountUser, peekCurrentUser, persistSignedInSession } from "@/lib/auth";
import { hasSignedInCookie } from "@/lib/signed-in-cookie";

export function PublicHome() {
  const { user, loading } = useAuth();
  const sent = useRef(false);
  const current = user ?? peekCurrentUser();
  const account = isAccountUser(current);
  const restoring = loading && (account || hasSignedInCookie());

  useEffect(() => {
    if (sent.current || !isAccountUser(user)) return;
    sent.current = true;
    persistSignedInSession(user);
    enterAppAfterSignIn(true);
  }, [user]);

  if (account || restoring) {
    return <div className="min-h-dvh bg-[#0a0a0a]" />;
  }

  return <LandingScreen />;
}
