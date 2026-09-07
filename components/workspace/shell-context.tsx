"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type SettingsSection = "account" | "appearance" | "help" | "upgrade";

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
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  closeSettings: () => void;
  projectSettings: ProjectSettingsBridge | null;
  setProjectSettings: (value: ProjectSettingsBridge | null) => void;
  pendingPanel: PendingPanel | null;
  setPendingPanel: (value: PendingPanel | null) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

const COLLAPSE_KEY = "tv.sidebar.collapsed";

export function ShellProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  });
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("account");
  const [projectSettings, setProjectSettings] = useState<ProjectSettingsBridge | null>(null);
  const [pendingPanel, setPendingPanel] = useState<PendingPanel | null>(null);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
    }
  }, []);

  const openSettings = useCallback((section?: SettingsSection) => {
    setSettingsSection(section ?? "account");
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      sidebarHidden,
      setSidebarHidden,
      settingsOpen,
      settingsSection,
      openSettings,
      closeSettings,
      projectSettings,
      setProjectSettings,
      pendingPanel,
      setPendingPanel,
    }),
    [collapsed, setCollapsed, sidebarHidden, settingsOpen, settingsSection, openSettings, closeSettings, projectSettings, pendingPanel],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside ShellProvider.");
  return value;
}
