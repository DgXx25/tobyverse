"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Sidebar } from "@/components/sidebar";
import { AnalyticsSession } from "@/components/analytics-session";
import { ShellProvider } from "@/components/workspace/shell-context";
import { SettingsModal } from "@/components/workspace/settings-modal";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-muted">
        Add Firebase keys to <span className="mx-1 font-mono text-foreground">.env.local</span> to continue.
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ShellProvider>
      <div className="app-shell flex h-screen overflow-hidden">
        <div className="app-wallpaper" aria-hidden />
        <AnalyticsSession userId={user.uid} />
        <Sidebar />
        <main className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          {children}
        </main>
        <SettingsModal />
      </div>
    </ShellProvider>
  );
}
