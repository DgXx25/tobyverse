"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { writeSignedInCookie } from "@/lib/signed-in-cookie";
import { useAuth } from "@/components/auth-provider";
import { useShell, type AccountSheetPage } from "@/components/workspace/shell-context";
import { useTheme } from "@/components/workspace/theme-provider";
import { ThemePicker } from "@/components/workspace/theme-picker";
import { ParametersPanel } from "@/components/workspace/parameters-panel";
import { BillingCard } from "@/components/account/billing-card";
import { UsageMeters } from "@/components/account/usage-meters";
import { AccountDataControls } from "@/components/account/data-controls";
import { useUserProfile } from "@/components/account/use-user-profile";
import { emptyUsage } from "@/lib/account/plan";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
} from "@/components/ui/drawer";
import { UiIcon } from "@/components/workspace/ui-icon";
import { THEME_OPTIONS } from "@/lib/workspace/theme";

export function AccountSheet() {
  const { user } = useAuth();
  const router = useRouter();
  const { accountSheetOpen, accountSheetPage, closeAccountSheet, setAccountSheetPage } = useShell();
  const { theme } = useTheme();
  const { profile } = useUserProfile();

  const name = user?.displayName || "Signed in";
  const email = user?.email || "";
  const themeLabel = THEME_OPTIONS.find((option) => option.id === theme)?.label ?? "Dark";

  async function handleSignOut() {
    closeAccountSheet();
    await signOut(getFirebaseAuth());
    writeSignedInCookie(false);
    router.replace("/login");
  }

  return (
    <Drawer
      open={accountSheetOpen}
      onOpenChange={(open) => {
        if (open) return;
        closeAccountSheet();
      }}
    >
      <DrawerContent className="sheet-pad">
        <DrawerHandle className="mx-auto mt-2.5 mb-1" />
        <DrawerTitle className="sr-only">Account</DrawerTitle>
        <DrawerDescription className="sr-only">Account and appearance settings</DrawerDescription>
        <div key={accountSheetPage} className="sheet-page flex min-h-0 flex-1 flex-col">
          {accountSheetPage === "root" ? (
            <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
              <button
                type="button"
                onClick={() => {
                  closeAccountSheet();
                  router.push("/account");
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2"
              >
                <UserAvatar src={user?.photoURL} name={name} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium text-foreground">{name}</span>
                  {email ? <span className="block truncate text-[13px] text-muted">{email}</span> : null}
                </span>
                <UiIcon name="forward" size={16} className="shrink-0 text-muted" />
              </button>

              <p className="px-3 pb-1 pt-4 text-[12px] text-muted">General</p>
              <SheetRow
                icon={<UiIcon name="user" size={18} />}
                label="Account"
                onClick={() => {
                  closeAccountSheet();
                  router.push("/account");
                }}
              />
              <SheetRow
                icon={<UiIcon name="appearance" size={18} />}
                label="Appearance"
                value={themeLabel}
                onClick={() => setAccountSheetPage("appearance")}
              />
              <SheetRow
                icon={<UiIcon name="sliders" size={18} />}
                label="Parameters"
                onClick={() => setAccountSheetPage("parameters")}
              />

              <p className="px-3 pb-1 pt-4 text-[12px] text-muted">Payments</p>
              <SheetRow
                icon={<UiIcon name="billing" size={18} />}
                label="Billing"
                onClick={() => setAccountSheetPage("billing")}
              />
              <SheetRow
                icon={<UiIcon name="usage" size={18} />}
                label="Usage"
                onClick={() => setAccountSheetPage("usage")}
              />

              <p className="px-3 pb-1 pt-4 text-[12px] text-muted">Data & Information</p>
              <SheetRow
                icon={<UiIcon name="data" size={18} />}
                label="Data"
                onClick={() => setAccountSheetPage("data")}
              />

              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="mt-4 flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-foreground hover:bg-surface-2"
              >
                <span className="flex h-[25px] w-[25px] items-center justify-center text-muted">
                  <UiIcon name="logout" size={18} />
                </span>
                Sign out
              </button>
            </div>
          ) : (
            <NestedPage title={pageTitle(accountSheetPage)} onBack={() => setAccountSheetPage("root")}>
              {accountSheetPage === "appearance" && (
                <div className="px-4 pb-6">
                  <p className="mb-4 text-[15px] font-medium text-foreground">Theme</p>
                  <ThemePicker />
                </div>
              )}
              {accountSheetPage === "parameters" && (
                <div className="px-4 pb-8">
                  <ParametersPanel />
                </div>
              )}
              {accountSheetPage === "billing" && (
                <div className="px-4 pb-8">
                  <BillingCard />
                </div>
              )}
              {accountSheetPage === "usage" && (
                <div className="px-4 pb-8">
                  <UsageMeters usage={profile?.usage ?? emptyUsage()} />
                </div>
              )}
              {accountSheetPage === "data" && (
                <div className="px-4 pb-8">
                  <AccountDataControls />
                </div>
              )}
            </NestedPage>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function pageTitle(page: AccountSheetPage): string {
  if (page === "appearance") return "Appearance";
  if (page === "parameters") return "Parameters";
  if (page === "billing") return "Billing";
  if (page === "usage") return "Usage";
  if (page === "data") return "Data";
  return "Account";
}

function NestedPage({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 pb-1">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-surface-2"
          aria-label="Back"
        >
          <UiIcon name="back" size={20} />
        </button>
      </div>
      <h2 className="px-5 pb-3 text-[22px] font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}

function SheetRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-surface-2"
    >
      <span className="flex h-[25px] w-[25px] items-center justify-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 text-[15px] text-foreground">{label}</span>
      {value ? <span className="text-[13px] text-muted">{value}</span> : null}
      <UiIcon name="forward" size={16} className="shrink-0 text-muted" />
    </button>
  );
}

function UserAvatar({ src, name, size }: { src?: string | null; name: string; size: "sm" | "lg" }) {
  const dim = size === "lg" ? "h-11 w-11 text-sm" : "h-7 w-7 text-[11px]";
  if (src) {
    return <img src={src} alt="" className={`${size === "lg" ? "h-11 w-11" : "h-7 w-7"} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground ${dim}`}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
