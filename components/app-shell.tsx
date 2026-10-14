"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Topbar } from "@/components/topbar";
import { AccountSheet } from "@/components/account-sheet";
import { ShellProvider } from "@/components/workspace/shell-context";
import { SettingsModal } from "@/components/workspace/settings-modal";
import { WhatsNewModal } from "@/components/whats-new-modal";
import { ChatSearch } from "@/components/chat-search";
import { ChatModeSync } from "@/components/account/chat-mode-sync";

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
  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden">
      <div className="app-wallpaper" aria-hidden />
      <div className="relative z-[2] shrink-0">
        <Topbar />
      </div>
      <main className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="page-y-scroll flex h-0 min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </main>
      <SettingsModal />
      <AccountSheet />
      <WhatsNewModal />
      <ChatSearch userId={userId} />
      <ChatModeSync />
    </div>
  );
}
