"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Sidebar } from "@/components/sidebar";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { AccountSheet } from "@/components/account-sheet";
import { AnalyticsSession } from "@/components/analytics-session";
import { ShellProvider, useShell } from "@/components/workspace/shell-context";
import { SettingsModal } from "@/components/workspace/settings-modal";
import { WhatsNewModal } from "@/components/whats-new-modal";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (loading || user || sent.current) return;
    sent.current = true;
    router.replace("/");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-sm text-muted">
        Add Firebase keys to <span className="mx-1 font-mono text-foreground">.env.local</span> to continue.
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ShellProvider>
      <AppShellFrame userId={user.uid}>{children}</AppShellFrame>
    </ShellProvider>
  );
}

function AppShellFrame({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { mobileNavOpen } = useShell();

  useEffect(() => {
    const root = document.documentElement;
    if (!mobileNavOpen) {
      root.classList.remove("nav-lock");
      return;
    }
    root.classList.add("nav-lock");
    return () => root.classList.remove("nav-lock");
  }, [mobileNavOpen]);

  return (
    <div className="app-shell flex h-dvh overflow-hidden">
      <div className="app-wallpaper" aria-hidden />
      <AnalyticsSession userId={userId} />
      <Sidebar />
      <main className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        <MobileTopBar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
      <SettingsModal />
      <AccountSheet />
      <WhatsNewModal />
    </div>
  );
}
