"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { writeSignedInCookie } from "@/lib/signed-in-cookie";

export function LandingAuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  useLayoutEffect(() => {
    if (!user) return;
    writeSignedInCookie(true);
    window.location.replace("/");
  }, [user]);

  if (loading || user) {
    return <div className="min-h-screen bg-background" />;
  }

  return children;
}
