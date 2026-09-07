"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAdminEmail } from "@/lib/admin/constants";
import { useAuth } from "@/components/auth-provider";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = isAdminEmail(user?.email);

  useEffect(() => {
    if (!loading && user && !allowed) {
      router.replace("/");
    }
  }, [allowed, loading, router, user]);

  if (loading || !user) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>
    );
  }

  if (!allowed) {
    return null;
  }

  return children;
}
