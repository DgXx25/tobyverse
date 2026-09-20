"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isMobileWidth, MOBILE_MQ } from "@/lib/workspace/media";

export type SettingsSection = "account" | "appearance" | "parameters" | "help" | "billing" | "usage" | "data" | "memory";
export type AccountSheetPage = "root" | "appearance" | "parameters" | "billing" | "usage" | "data" | "memory";

export type PendingPanel = {
  projectId: string;
  kind: "material" | "sheet" | "plan" | "practice" | "path";
  id: string;
  title?: string;
};

export type ProjectSettingsBridge = {
  projectTitle: string;
  deleting: boolean;
  deleteError: string | null;
  onDelete: () => void;
};

type ShellContextValue = {
  sidebarHidden: boolean;
  setSidebarHidden: (value: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (value: boolean) => void;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  accountSheetOpen: boolean;
  accountSheetPage: AccountSheetPage;
  openAccountSheet: (page?: AccountSheetPage) => void;
  closeAccountSheet: () => void;
  setAccountSheetPage: (page: AccountSheetPage) => void;
  projectSettings: ProjectSettingsBridge | null;
  setProjectSettings: (value: ProjectSettingsBridge | null) => void;
  pendingPanel: PendingPanel | null;
  setPendingPanel: (value: PendingPanel | null) => void;
  mobileTopActions: ReactNode;
  setMobileTopActions: (value: ReactNode) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

function blurActive() {
  if (typeof document === "undefined") return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function sectionToSheetPage(section?: SettingsSection): AccountSheetPage {
  if (
    section === "appearance" ||
    section === "parameters" ||
    section === "billing" ||
    section === "usage" ||
    section === "data" ||
    section === "memory"
  ) {
    return section;
  }
  return "root";
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [mobileNavOpen, setMobileNavOpenState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [accountSheetPage, setAccountSheetPage] = useState<AccountSheetPage>("root");
  const [projectSettings, setProjectSettings] = useState<ProjectSettingsBridge | null>(null);
  const [pendingPanel, setPendingPanel] = useState<PendingPanel | null>(null);
  const [mobileTopActions, setMobileTopActions] = useState<ReactNode>(null);

  const setMobileNavOpen = useCallback((value: boolean) => {
    if (!value) blurActive();
    setMobileNavOpenState(value);
  }, []);

  const closeAccountSheet = useCallback(() => {
    blurActive();
    setAccountSheetOpen(false);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    function onChange() {
      if (mq.matches) {
        setSettingsOpen(false);
        return;
      }
      setMobileNavOpenState(false);
      setAccountSheetOpen(false);
      setAccountSheetPage("root");
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const openAccountSheet = useCallback((page: AccountSheetPage = "root") => {
    blurActive();
    setMobileNavOpenState(false);
    setAccountSheetPage(page);
    setAccountSheetOpen(true);
  }, []);

  const openSettings = useCallback((section?: SettingsSection) => {
    if (section === "account") {
      setSettingsOpen(false);
      setAccountSheetOpen(false);
      setAccountSheetPage("root");
      router.push("/account");
      return;
    }
    if (isMobileWidth()) {
      blurActive();
      setMobileNavOpenState(false);
      setAccountSheetPage(sectionToSheetPage(section));
      setAccountSheetOpen(true);
      return;
    }
    setSettingsSection(section ?? "appearance");
    setSettingsOpen(true);
  }, [router]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value = useMemo(
    () => ({
      sidebarHidden,
      setSidebarHidden,
      mobileNavOpen,
      setMobileNavOpen,
      settingsOpen,
      settingsSection,
      openSettings,
      closeSettings,
      accountSheetOpen,
      accountSheetPage,
      openAccountSheet,
      closeAccountSheet,
      setAccountSheetPage,
      projectSettings,
      setProjectSettings,
      pendingPanel,
      setPendingPanel,
      mobileTopActions,
      setMobileTopActions,
    }),
    [
      sidebarHidden,
      mobileNavOpen,
      setMobileNavOpen,
      settingsOpen,
      settingsSection,
      openSettings,
      closeSettings,
      accountSheetOpen,
      accountSheetPage,
      openAccountSheet,
      closeAccountSheet,
      projectSettings,
      pendingPanel,
      mobileTopActions,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside ShellProvider.");
  return value;
}
