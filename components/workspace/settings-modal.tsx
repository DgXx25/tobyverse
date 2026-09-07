"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useShell, type SettingsSection } from "@/components/workspace/shell-context";
import { ThemePicker } from "@/components/workspace/theme-picker";
import { BillingCard } from "@/components/account/billing-card";
import { UsageMeters } from "@/components/account/usage-meters";
import { AccountDataControls } from "@/components/account/data-controls";
import { useUserProfile } from "@/components/account/use-user-profile";
import { emptyUsage } from "@/lib/account/plan";
import {
  IconAccount,
  IconAppearance,
  IconBilling,
  IconData,
  IconHelp,
  IconUsage,
  IconX,
} from "@/components/workspace/icons";

const NAV: { id: SettingsSection; label: string; group: string; icon: ReactNode }[] = [
  { id: "account", label: "Account", group: "General", icon: <IconAccount className="h-[18px] w-[18px]" /> },
  { id: "appearance", label: "Appearance", group: "General", icon: <IconAppearance className="h-[18px] w-[18px]" /> },
  { id: "help", label: "Help", group: "TobyVerse", icon: <IconHelp className="h-[18px] w-[18px]" /> },
  { id: "billing", label: "Billing", group: "Payments", icon: <IconBilling className="h-[18px] w-[18px]" /> },
  { id: "usage", label: "Usage", group: "Payments", icon: <IconUsage className="h-[18px] w-[18px]" /> },
  { id: "data", label: "Data", group: "Data & Information", icon: <IconData className="h-[18px] w-[18px]" /> },
];

const GROUPS = ["General", "TobyVerse", "Payments", "Data & Information"];

export function SettingsModal() {
  const router = useRouter();
  const { settingsOpen, settingsSection, openSettings, closeSettings } = useShell();
  const { profile } = useUserProfile();

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeSettings();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, closeSettings]);

  if (!settingsOpen) return null;

  function onNav(id: SettingsSection) {
    if (id === "account") {
      closeSettings();
      router.push("/account");
      return;
    }
    openSettings(id);
  }

  return (
    <div className="fixed inset-0 z-50 hidden items-center justify-center bg-overlay p-4 md:flex" onClick={closeSettings}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative flex h-[min(640px,86vh)] w-full max-w-[860px] overflow-hidden rounded-2xl bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="flex w-[220px] shrink-0 flex-col px-2 py-3">
          {GROUPS.map((group) => (
            <div key={group} className="mb-4">
              <p className="px-2.5 pb-1.5 text-[11px] text-muted">{group}</p>
              {NAV.filter((item) => item.group === group).map((item) => {
                const active = settingsSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNav(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] ${
                      active ? "bg-surface-2 text-foreground" : "text-foreground/90 hover:bg-surface-2/70"
                    }`}
                  >
                    <span className={active ? "text-foreground" : "text-muted"}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <div className="relative min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <button
            type="button"
            onClick={closeSettings}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-foreground hover:bg-border"
            aria-label="Close settings"
          >
            <IconX className="h-[18px] w-[18px]" />
          </button>

          {settingsSection === "account" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Account</h2>
              <p className="mt-6 text-[15px] leading-7 text-muted">Name, email, plan, and sign-in methods live on your account page.</p>
              <button
                type="button"
                onClick={() => {
                  closeSettings();
                  router.push("/account");
                }}
                className="mt-6 rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background"
              >
                Open account
              </button>
            </div>
          )}

          {settingsSection === "appearance" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Appearance</h2>
              <p className="mt-8 text-[15px] font-medium text-foreground">Theme</p>
              <div className="mt-4">
                <ThemePicker />
              </div>
            </div>
          )}

          {settingsSection === "help" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Help</h2>
              <p className="mt-6 text-[15px] leading-7 text-muted">Help is not written yet.</p>
            </div>
          )}

          {settingsSection === "billing" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Billing</h2>
              <div className="mt-8 max-w-sm">
                <BillingCard />
              </div>
            </div>
          )}

          {settingsSection === "usage" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Usage</h2>
              <div className="mt-8 max-w-md">
                <UsageMeters usage={profile?.usage ?? emptyUsage()} />
              </div>
            </div>
          )}

          {settingsSection === "data" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Data</h2>
              <div className="mt-6">
                <AccountDataControls />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
