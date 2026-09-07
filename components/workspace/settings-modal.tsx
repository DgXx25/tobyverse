"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { useShell, type SettingsSection } from "@/components/workspace/shell-context";
import { useTheme } from "@/components/workspace/theme-provider";
import {
  IconAccount,
  IconAppearance,
  IconBilling,
  IconHelp,
  IconX,
} from "@/components/workspace/icons";
import { THEME_OPTIONS, type ThemePreview } from "@/lib/workspace/theme";

const NAV: { id: SettingsSection; label: string; group: string; icon: ReactNode }[] = [
  { id: "account", label: "Account", group: "General", icon: <IconAccount className="h-[18px] w-[18px]" /> },
  { id: "appearance", label: "Appearance", group: "General", icon: <IconAppearance className="h-[18px] w-[18px]" /> },
  { id: "help", label: "Help", group: "TobyVerse", icon: <IconHelp className="h-[18px] w-[18px]" /> },
  { id: "upgrade", label: "Upgrade", group: "TobyVerse", icon: <IconBilling className="h-[18px] w-[18px]" /> },
];

const GROUPS = ["General", "TobyVerse"];

export function SettingsModal() {
  const { user } = useAuth();
  const { settingsOpen, settingsSection, openSettings, closeSettings, projectSettings } = useShell();
  const { theme, setTheme } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeSettings();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, closeSettings]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [settingsSection, settingsOpen]);

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={closeSettings}>
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
                    onClick={() => openSettings(item.id)}
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
              <div className="mt-6 divide-y divide-border">
                <div className="flex items-center justify-between py-5">
                  <div className="flex items-center gap-3">
                    <Avatar src={user?.photoURL} name={user?.displayName || user?.email} />
                    <div>
                      <p className="text-[15px] font-medium text-foreground">{user?.displayName || "Signed in"}</p>
                      <p className="text-[13px] text-muted">{user?.email}</p>
                    </div>
                  </div>
                </div>

                {projectSettings && (
                  <div className="py-5">
                    <p className="text-[15px] text-foreground">Delete current project</p>
                    <p className="mt-1 truncate text-[13px] text-muted">{projectSettings.projectTitle}</p>
                    <p className="mt-1 text-[13px] text-muted">Removes chat, materials, notes, and exercises.</p>
                    {projectSettings.deleteError && (
                      <p className="mt-2 text-[13px] text-red-400">{projectSettings.deleteError}</p>
                    )}
                    {confirmDelete ? (
                      <div className="mt-4 flex gap-2">
                        <GhostButton onClick={() => setConfirmDelete(false)}>Cancel</GhostButton>
                        <button
                          type="button"
                          onClick={projectSettings.onDelete}
                          disabled={projectSettings.deleting}
                          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-[13px] text-red-400 hover:bg-red-500/10"
                        >
                          {projectSettings.deleting ? "Deleting…" : "Confirm delete"}
                        </button>
                      </div>
                    ) : (
                      <GhostButton className="mt-4" onClick={() => setConfirmDelete(true)}>
                        Delete
                      </GhostButton>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {settingsSection === "appearance" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Appearance</h2>
              <p className="mt-8 text-[15px] font-medium text-foreground">Theme</p>
              <div className="mt-4 flex flex-wrap gap-4">
                {THEME_OPTIONS.map((option) => (
                  <ThemeCard
                    key={option.id}
                    label={option.label}
                    preview={option.preview}
                    selected={theme === option.id}
                    onSelect={() => setTheme(option.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {settingsSection === "help" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Help</h2>
              <p className="mt-6 text-[15px] leading-7 text-muted">Help is not written yet.</p>
            </div>
          )}

          {settingsSection === "upgrade" && (
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Upgrade</h2>
              <p className="mt-6 text-[15px] leading-7 text-muted">Plans are not available yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  label,
  preview,
  selected,
  onSelect,
}: {
  label: string;
  preview: ThemePreview;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className="w-[128px] text-center">
      <div
        className={`overflow-hidden rounded-xl border p-1 ${
          selected ? "border-foreground" : "border-transparent hover:border-border"
        }`}
      >
        <div className="flex h-[78px] overflow-hidden rounded-lg border border-black/10" style={{ background: preview.bg }}>
          <div className="w-[30%] shrink-0" style={{ background: preview.sidebar }} />
          <div className="flex flex-1 flex-col gap-1.5 p-2.5">
            <div className="h-1.5 w-9 rounded-full" style={{ background: preview.text, opacity: 0.9 }} />
            <div className="h-1 w-full rounded-full" style={{ background: preview.muted }} />
            <div className="h-1 w-[72%] rounded-full" style={{ background: preview.muted }} />
            <div className="mt-auto h-4 w-full rounded" style={{ background: preview.sidebar }} />
          </div>
        </div>
      </div>
      <span className={`mt-2.5 block text-[13px] ${selected ? "text-foreground" : "text-muted"}`}>{label}</span>
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-surface-2 ${className}`}
    >
      {children}
    </button>
  );
}

function Avatar({ src, name }: { src?: string | null; name?: string | null }) {
  if (src) {
    return <img src={src} alt="" className="h-11 w-11 rounded-full object-cover" />;
  }
  const letter = (name ?? "T").trim().charAt(0).toUpperCase();
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-sm text-foreground">
      {letter}
    </span>
  );
}
