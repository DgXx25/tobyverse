"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isMobileWidth, MOBILE_MQ } from "@/lib/workspace/media";

export type SettingsSection = "account" | "appearance" | "parameters" | "help" | "planUsage" | "billing" | "usage" | "data" | "memory";
export type AccountSheetPage = "root" | "appearance" | "parameters" | "planUsage" | "billing" | "usage" | "data" | "memory";

export type PendingPanel = {
  projectId: string;
  kind: "material" | "sheet" | "plan" | "practice" | "path" | "settings";
  id: string;
  title?: string;
};

export type ProjectSettingsBridge = {
  projectTitle: string;
  deleting: boolean;
  deleteError: string | null;
  onDelete: () => void;
};

/** The open notebook's share control. The top bar shows it; the notebook owns the behaviour. */
export type ProjectShareBridge = {
  active: boolean;
  busy: boolean;
  onToggle: () => void;
};

type ShellContextValue = {
  projectShare: ProjectShareBridge | null;
  setProjectShare: (value: ProjectShareBridge | null) => void;
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
  selectedProjectId: string | null;
  setSelectedProjectId: (value: string | null) => void;
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
    section === "planUsage" ||
    section === "billing" ||
    section === "usage" ||
    section === "data" ||
    section === "memory"
  ) {
    return section === "billing" || section === "usage" ? "planUsage" : section;
  }
  return "root";
}

const SELECTED_PROJECT_KEY = "tv.selectedProject";

function readSelectedProject(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(SELECTED_PROJECT_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [mobileNavOpen, setMobileNavOpenState] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [accountSheetPage, setAccountSheetPage] = useState<AccountSheetPage>("root");
  const [projectSettings, setProjectSettings] = useState<ProjectSettingsBridge | null>(null);
  const [pendingPanel, setPendingPanel] = useState<PendingPanel | null>(null);
  const [mobileTopActions, setMobileTopActions] = useState<ReactNode>(null);
  const [projectShare, setProjectShare] = useState<ProjectShareBridge | null>(null);
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(readSelectedProject);

  const setSelectedProjectId = useCallback((value: string | null) => {
    setSelectedProjectIdState(value);
    try {
      if (value) window.sessionStorage.setItem(SELECTED_PROJECT_KEY, value);
      else window.sessionStorage.removeItem(SELECTED_PROJECT_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);

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
      window.open("/account", "_blank", "noopener,noreferrer");
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
  }, []);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value = useMemo(
    () => ({
      projectShare,
      setProjectShare,
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
      selectedProjectId,
      setSelectedProjectId,
    }),
    [
      projectShare,
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
      selectedProjectId,
      setSelectedProjectId,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside ShellProvider.");
  return value;
}
