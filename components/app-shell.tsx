"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Topbar } from "@/components/topbar";
import { ShellProvider, useShell } from "@/components/workspace/shell-context";
import { WhatsNewModal } from "@/components/whats-new-modal";
import { ChatModeSync } from "@/components/account/chat-mode-sync";
import { ProjectTabKeepAlive } from "@/components/workspace/project-tab-keep-alive";
import { CHAT_SEARCH_OPEN_EVENT } from "@/lib/workspace/ui-events";

const SettingsModal = dynamic(() => import("@/components/workspace/settings-modal").then((mod) => mod.SettingsModal), { ssr: false });
const AccountSheet = dynamic(() => import("@/components/account-sheet").then((mod) => mod.AccountSheet), { ssr: false });
const ChatSearch = dynamic(() => import("@/components/chat-search").then((mod) => mod.ChatSearch), { ssr: false });

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
  const { settingsOpen, accountSheetOpen } = useShell();
  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden">
      <div className="app-wallpaper" aria-hidden />
      <div className="relative z-[2] shrink-0">
        <Topbar />
      </div>
      <main className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="page-y-scroll flex h-0 min-h-0 min-w-0 flex-1 flex-col">
          <ProjectTabKeepAlive>{children}</ProjectTabKeepAlive>
        </div>
      </main>
      {settingsOpen ? <SettingsModal /> : null}
      {accountSheetOpen ? <AccountSheet /> : null}
      <WhatsNewModal />
      <LazyChatSearch userId={userId} />
      <ChatModeSync />
    </div>
  );
}

function LazyChatSearch({ userId }: { userId: string }) {
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    const open = () => setRequested(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setRequested(true);
      }
    };
    window.addEventListener(CHAT_SEARCH_OPEN_EVENT, open);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(CHAT_SEARCH_OPEN_EVENT, open);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return requested ? <ChatSearch userId={userId} initiallyOpen /> : null;
}
