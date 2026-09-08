"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function LandingAuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (loading || !user || sent.current) return;
    sent.current = true;
    router.replace("/new");
  }, [loading, user, router]);

  if (loading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (user) {
    return <div className="min-h-screen bg-background" />;
  }

  return children;
}
