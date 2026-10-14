"use client";

import { ShellProvider } from "@/components/workspace/shell-context";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { SettingsModal } from "@/components/workspace/settings-modal";
import { AccountSheet } from "@/components/account-sheet";
import { WhatsNewModal } from "@/components/whats-new-modal";

export function AdminWorkspaceShell({ children }: { children: React.ReactNode }) {
  return <ShellProvider>
    <div className="app-shell flex h-dvh overflow-hidden">
      <div className="app-wallpaper" aria-hidden />
      <AdminSidebar />
      <main className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <MobileTopBar />
        <div className="page-y-scroll flex h-0 min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </main>
      <SettingsModal />
      <AccountSheet />
      <WhatsNewModal />
    </div>
  </ShellProvider>;
}
