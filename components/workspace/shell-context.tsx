"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isMobileWidth, MOBILE_MQ } from "@/lib/workspace/media";

export type SettingsSection = "account" | "appearance" | "help" | "billing" | "usage" | "data";
export type AccountSheetPage = "root" | "appearance" | "billing" | "usage" | "data";

export type PendingPanel = {
  projectId: string;
  kind: "material" | "sheet" | "plan" | "practice";
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
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
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

const COLLAPSE_KEY = "tv.sidebar.collapsed";

function sectionToSheetPage(section?: SettingsSection): AccountSheetPage {
  if (section === "appearance" || section === "billing" || section === "usage" || section === "data") return section;
  return "root";
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  });
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [mobileNavOpen, setMobileNavOpenState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [accountSheetPage, setAccountSheetPage] = useState<AccountSheetPage>("root");
  const [projectSettings, setProjectSettings] = useState<ProjectSettingsBridge | null>(null);
  const [pendingPanel, setPendingPanel] = useState<PendingPanel | null>(null);
  const [mobileTopActions, setMobileTopActions] = useState<ReactNode>(null);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
    }
  }, []);

  const setMobileNavOpen = useCallback((value: boolean) => {
    setMobileNavOpenState(value);
  }, []);

  const closeAccountSheet = useCallback(() => {
    setAccountSheetOpen(false);
    setAccountSheetPage("root");
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
      collapsed,
      setCollapsed,
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
      collapsed,
      setCollapsed,
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
