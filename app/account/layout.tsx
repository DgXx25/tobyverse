"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted">Loading…</div>
    );
  }

  if (!configured) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-sm text-muted">
        Add Firebase keys to <span className="mx-1 font-mono text-foreground">.env.local</span> to continue.
      </div>
    );
  }

  if (!user) return null;
  return children;
}
