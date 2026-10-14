"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setState("denied");
      return;
    }
    let cancelled = false;
    void user.getIdToken().then((token) => fetch("/api/admin/session", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })).then((response) => {
      if (!cancelled) setState(response.ok ? "allowed" : "denied");
    }).catch(() => {
      if (!cancelled) setState("denied");
    });
    return () => { cancelled = true; };
  }, [loading, user]);

  if (state === "checking") return <div className="flex h-full items-center justify-center bg-background text-sm text-muted">Loading…</div>;
  if (state === "denied") return <main className="flex min-h-dvh items-center justify-center bg-background text-foreground"><div><p className="text-sm text-muted">404</p><h1 className="mt-1 text-xl font-medium">Page not found</h1></div></main>;
  return children;
}
