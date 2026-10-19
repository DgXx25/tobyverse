"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { writeSignedInCookie } from "@/lib/signed-in-cookie";
import { useAuth } from "@/components/auth-provider";
import { BrandMark } from "@/components/brand-mark";
import { CHAT_SEARCH_OPEN_EVENT } from "@/lib/workspace/ui-events";
import { useShell } from "@/components/workspace/shell-context";
import { UiIcon } from "@/components/workspace/ui-icon";
import { ProjectSymbol, iconSearchLabel } from "@/components/workspace/pack-icon";
import { updateProjectMeta, updateProjectTitle } from "@/lib/projects";
import { useTheme } from "@/components/workspace/theme-provider";
import { accentColor, type AccentId } from "@/lib/workspace/theme";
import { projectIconFor } from "@/lib/workspace/project-icons";
import { addOpenNotebook } from "@/lib/workspace/open-tabs";
import { positionContextMenu } from "@/lib/workspace/context-menu-position";
import { discardUntouchedNotebook } from "@/lib/workspace/discard-draft-notebook";
import { notebookTitle } from "@/lib/workspace/title";
import { useNotebooks } from "@/lib/workspace/use-notebooks";
import { activeNotebookId } from "@/lib/workspace/active-notebook-tab";
import {
  clearProjectActivityNotificationFor,
  getProjectActivityNotifications,
  subscribeProjectActivityNotifications,
} from "@/lib/workspace/project-activity";

const SYMBOL_COLORS = ["blue", "red", "orange", "yellow", "green", "teal", "purple", "pink"] as const satisfies readonly AccentId[];

const OPEN_KEY = "tv.openNotebooks";

function readOpen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(OPEN_KEY) || "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").reduce<string[]>((ids, id) => addOpenNotebook(ids, id), [])
      : [];
  } catch {
    return [];
  }
}

function writeOpen(ids: string[]) {
  try {
    window.sessionStorage.setItem(OPEN_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent("tv:open-notebook-tabs"));
  } catch {
    /* private mode */
  }
}

export function Topbar() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { openSettings, openAccountSheet, setSelectedProjectId, setPendingPanel, projectShare } = useShell();
  const { notebooks } = useNotebooks(user?.uid);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tabMenu, setTabMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [openIdsLoaded, setOpenIdsLoaded] = useState(false);
  const [activityNotifications, setActivityNotifications] = useState<string[]>([]);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [identityMenuOpen, setIdentityMenuOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"rename" | "icon">("rename");
  const [titleDraft, setTitleDraft] = useState("");
  const [iconDraft, setIconDraft] = useState("");
  const [iconNames, setIconNames] = useState<string[]>([]);
  const [iconQuery, setIconQuery] = useState("");
  const [iconColor, setIconColor] = useState<AccentId>("blue");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const previousActiveId = useRef<string | null>(null);

  const activeId = activeNotebookId(pathname);
  const activeProject = notebooks.find((item) => item.id === activeId);
  const libraryActive = pathname === "/library" || pathname.startsWith("/library/");
  const name = user?.displayName || user?.email || "Account";

  useEffect(() => {
    setSelectedProjectId(activeId);
  }, [activeId, setSelectedProjectId]);

  useEffect(() => {
    const previousId = previousActiveId.current;
    previousActiveId.current = activeId;
    if (!previousId || previousId === activeId || !user?.uid) return;
    void discardUntouchedNotebook(previousId, user.uid).then((deleted) => {
      if (!deleted) return;
      setOpenIds((current) => {
        return current.filter((id) => id !== previousId);
      });
    });
  }, [activeId, user?.uid]);

  useEffect(() => {
    setOpenIds(readOpen());
    setOpenIdsLoaded(true);
    setActivityNotifications(getProjectActivityNotifications());
    return subscribeProjectActivityNotifications(() => setActivityNotifications(getProjectActivityNotifications()));
  }, []);

  useEffect(() => {
    if (openIdsLoaded) writeOpen(openIds);
  }, [openIds, openIdsLoaded]);

  useEffect(() => {
    if (!editorId || editorMode !== "icon") return;
    let cancel = false;
    void import("@/lib/workspace/icon-names").then(({ ICON_NAMES }) => {
      if (!cancel) setIconNames([...ICON_NAMES]);
    });
    return () => {
      cancel = true;
    };
  }, [editorId, editorMode]);

  useEffect(() => {
    if (!activeId) return;
    clearProjectActivityNotificationFor(activeId);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    setOpenIds((current) => {
      if (current.includes(activeId)) return current;
      return addOpenNotebook(current, activeId);
    });
  }, [activeId]);

  useEffect(() => {
    router.prefetch("/new");
  }, [router]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, notebooks.length]);

  useEffect(() => {
    if (!tabMenu) return;
    function close() {
      setTabMenu(null);
    }
    function closeKey(event: KeyboardEvent) {
      if (event.key === "Escape") setTabMenu(null);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeKey);
    };
  }, [tabMenu]);

  useEffect(() => {
    if (!editorId && !identityMenuOpen) return;
    function closeEditor(event: PointerEvent) {
      if (!identityRef.current?.contains(event.target as Node)) {
        setEditorId(null);
        setIdentityMenuOpen(false);
      }
    }
    function closeKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setEditorId(null);
        setIdentityMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeEditor);
    document.addEventListener("keydown", closeKey);
    return () => {
      document.removeEventListener("pointerdown", closeEditor);
      document.removeEventListener("keydown", closeKey);
    };
  }, [editorId, identityMenuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeKey);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeKey);
    };
  }, [menuOpen]);

  function closeTab(id: string) {
    const next = openIds.filter((item) => item !== id);
    setOpenIds(next);
    if (id !== activeId) {
      if (user?.uid) void discardUntouchedNotebook(id, user.uid);
      return;
    }
    const fallback = next[next.length - 1];
    router.push(fallback ? `/p/${fallback}` : "/new");
  }

  function openEditor(id: string, mode: "rename" | "icon") {
    const project = notebooks.find((item) => item.id === id);
    if (!project) return;
    setEditorId(id);
    setEditorMode(mode);
    setTitleDraft(notebookTitle(project.title));
    setIconDraft(projectIconFor(project));
    setIconQuery("");
    setEditError(null);
    const savedColor = SYMBOL_COLORS.find((color) => accentColor(theme, color) === project.iconColor);
    setIconColor(savedColor ?? "blue");
  }

  async function saveProjectIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const project = notebooks.find((item) => item.id === editorId);
    const nextTitle = titleDraft.replace(/\s+/g, " ").trim();
    if (!project || !user?.uid || !nextTitle) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await Promise.all([
        updateProjectTitle(project.id, user.uid, nextTitle),
        updateProjectMeta(project.id, user.uid, { icon: iconDraft, iconColor: accentColor(theme, iconColor) }),
      ]);
      setEditorId(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update project.");
    } finally {
      setSavingEdit(false);
    }
  }

  const editedProject = notebooks.find((item) => item.id === editorId);
  const matchingIcons = (() => {
    const query = iconQuery.trim().toLowerCase();
    return (query ? iconNames.filter((value) => iconSearchLabel(value).includes(query) || value.toLowerCase().includes(query)) : iconNames).slice(0, 64);
  })();

  async function handleSignOut() {
    await signOut(getFirebaseAuth());
    writeSignedInCookie(false);
    router.replace("/login");
  }

  function pick(section: Parameters<typeof openSettings>[0]) {
    setMenuOpen(false);
    openSettings(section);
  }

  return (
    <header className="mobile-topbar relative z-20 flex h-12 shrink-0 items-center gap-1 bg-background px-2 max-md:h-auto max-md:min-h-[44px]">
      <div className="flex shrink-0 items-center">
        <span className="flex h-9 w-9 items-center justify-center">
          <BrandMark href="/new" />
        </span>
      </div>

      <nav aria-label="Notebooks" className="topbar-tabs flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto max-md:hidden">
        {openIds.map((id) => {
          const project = notebooks.find((item) => item.id === id);
          if (!project) return null;
          const isActive = project.id === activeId;
          return (
            <span
              key={project.id}
              className="group relative flex w-[208px] max-w-[216px] shrink-0"
              onContextMenu={(event) => {
                event.preventDefault();
                const position = positionContextMenu(event.clientX, event.clientY, 180, 124, window.innerWidth, window.innerHeight);
                setTabMenu({ id: project.id, ...position });
              }}
            >
              <Link
                ref={isActive ? activeTabRef : undefined}
                href={`/p/${project.id}`}
                title={notebookTitle(project.title)}
                aria-current={isActive ? "page" : undefined}
                onClick={isActive ? (event) => event.preventDefault() : undefined}
                className={`sidebar-item-rest flex h-9 w-full min-w-0 items-center gap-1.5 rounded-xl pl-2.5 pr-7 text-[13px] ${
                  isActive ? "sidebar-item-active cursor-default text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <ProjectSymbol name={projectIconFor(project)} size={20} color={project.iconColor} className="shrink-0" />
                <span className="min-w-0 truncate">{notebookTitle(project.title)}</span>
              </Link>
              <button
                type="button"
                aria-label={`Close ${notebookTitle(project.title)}`}
                onClick={() => closeTab(project.id)}
                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-foreground/10 hover:text-foreground"
              >
                {activityNotifications.includes(project.id) && !isActive ? (
                  <span aria-label="Finished activity" className="absolute right-[22px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-red-500" />
                ) : null}
                <UiIcon name="close" size={16} />
              </button>
            </span>
          );
        })}
        {pathname !== "/new" ? (
          <Link
            href="/new"
            aria-label="Projects"
            className="sidebar-item-rest flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-foreground"
          >
            <UiIcon name="plus" size={16} />
          </Link>
        ) : null}
      </nav>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-0.5 md:flex-none">
        {activeProject ? (
          <div ref={identityRef} className="relative mr-1 min-w-0 max-w-[250px] flex-1 md:flex-none">
            <button
              type="button"
              aria-label={`Project options for ${notebookTitle(activeProject.title)}`}
              aria-expanded={identityMenuOpen || editorId === activeId}
              onClick={() => {
                setEditorId(null);
                setIdentityMenuOpen((open) => !open);
              }}
              className="sidebar-item-rest flex h-9 max-w-full items-center gap-2 rounded-xl px-2 text-[14px] font-medium text-foreground hover:bg-foreground/5"
            >
              <ProjectSymbol name={projectIconFor(activeProject)} size={18} color={activeProject.iconColor} className="shrink-0" />
              <span className="truncate">{notebookTitle(activeProject.title)}</span>
            </button>
            {identityMenuOpen ? (
              <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-surface-2 p-1 text-[13px] text-foreground shadow-xl">
                <button type="button" role="menuitem" onClick={() => { setIdentityMenuOpen(false); openEditor(activeProject.id, "rename"); }} className="flex w-full items-center rounded-lg px-2.5 py-2 text-left hover:bg-foreground/10">Rename</button>
                <button type="button" role="menuitem" onClick={() => { setIdentityMenuOpen(false); openEditor(activeProject.id, "icon"); }} className="flex w-full items-center rounded-lg px-2.5 py-2 text-left hover:bg-foreground/10">Change symbol</button>
              </div>
            ) : null}
            {editorId && editedProject ? (
              <div className="absolute right-0 top-full z-50 mt-1 w-[288px] rounded-xl border border-border bg-surface-2 p-2 text-foreground shadow-xl" onPointerDown={(event) => event.stopPropagation()}>
                <form onSubmit={(event) => void saveProjectIdentity(event)}>
                  <label className="mb-1 block px-1 text-[11px] text-muted">Project name</label>
                  <input autoFocus={editorMode === "rename"} value={titleDraft} maxLength={80} onChange={(event) => setTitleDraft(event.target.value)} aria-label="Project name" className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none" />
                  <div className="my-2 flex items-center gap-2 px-1">
                    <ProjectSymbol name={iconDraft} size={20} color={accentColor(theme, iconColor)} />
                    <span className="text-[12px] text-muted">Symbol</span>
                    <input autoFocus={editorMode === "icon"} value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder="Search symbols" aria-label="Search symbols" className="ml-auto h-7 w-[135px] rounded-md border border-border bg-background px-2 text-[12px] outline-none" />
                  </div>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    {SYMBOL_COLORS.map((colorId) => {
                      const color = accentColor(theme, colorId);
                      return <button key={colorId} type="button" aria-label={`${colorId} symbol color`} aria-pressed={iconColor === colorId} onClick={() => setIconColor(colorId)} className="h-4 w-4 rounded-full" style={{ background: color, outline: iconColor === colorId ? "2px solid var(--text)" : "none", outlineOffset: 2 }} />;
                    })}
                  </div>
                  <div className="grid max-h-[168px] grid-cols-8 gap-1 overflow-y-auto">
                    {matchingIcons.map((symbol) => (
                      <button key={symbol} type="button" aria-label={iconSearchLabel(symbol)} title={iconSearchLabel(symbol)} aria-pressed={iconDraft === symbol} onClick={() => setIconDraft(symbol)} className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-foreground/10 ${iconDraft === symbol ? "bg-foreground/10" : ""}`}>
                        <ProjectSymbol name={symbol} size={17} color={accentColor(theme, iconColor)} />
                      </button>
                    ))}
                  </div>
                  {editError ? <p role="alert" className="px-1 pt-1 text-[12px] text-red-500">{editError}</p> : null}
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button type="button" onClick={() => setEditorId(null)} className="h-8 rounded-lg px-2.5 text-[12px] text-muted hover:bg-foreground/10">Cancel</button>
                    <button type="submit" disabled={savingEdit || !titleDraft.trim()} className="h-8 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background disabled:opacity-50">{savingEdit ? "Saving…" : "Save"}</button>
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}
        <span className="mobile-search-button max-md:hidden">
          <IconButton label="Search" onClick={() => window.dispatchEvent(new Event(CHAT_SEARCH_OPEN_EVENT))}>
            <UiIcon name="search" size={17} />
          </IconButton>
        </span>
        {activeId ? (
          <IconButton
            label="Notebook settings"
            onClick={() => setPendingPanel({ projectId: activeId, kind: "settings", id: "settings" })}
          >
            <UiIcon name="sliders" size={17} />
          </IconButton>
        ) : null}
        {projectShare ? (
          <button
            type="button"
            onClick={projectShare.onToggle}
            disabled={projectShare.busy}
            aria-label={projectShare.active ? "Unshare" : "Share"}
            title={projectShare.active ? "Unshare" : "Share"}
            aria-pressed={projectShare.active}
            className={`sidebar-item-rest flex h-9 w-9 items-center justify-center rounded-xl text-foreground disabled:opacity-50 ${
              projectShare.active ? "sidebar-item-active" : ""
            }`}
          >
            <UiIcon name="share" size={17} />
          </button>
        ) : null}
        <Link
          href="/library"
          aria-label="Library"
          title="Library"
          className={`sidebar-item-rest flex h-9 w-9 items-center justify-center rounded-xl text-foreground max-md:hidden ${
            libraryActive ? "sidebar-item-active" : ""
          }`}
        >
          <UiIcon name="library" size={17} />
        </Link>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="Account"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              if (window.matchMedia("(max-width: 767px)").matches) {
                openAccountSheet("root");
                return;
              }
              setMenuOpen((open) => !open);
            }}
            className="sidebar-profile-trigger flex h-9 w-9 items-center justify-center rounded-full"
          >
            <Avatar src={user?.photoURL} name={name} />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 w-[220px] overflow-hidden rounded-xl border border-border bg-surface-2 p-1 shadow-xl"
            >
              <p className="truncate px-2.5 py-2 text-[11px] text-muted">{user?.email}</p>
              <MenuRow icon={<UiIcon name="user" size={16} />} label="Account" onClick={() => pick("account")} />
              <MenuRow icon={<UiIcon name="settings" size={16} />} label="Settings" onClick={() => pick("appearance")} />
              <MenuRow icon={<UiIcon name="help" size={16} />} label="Help" onClick={() => pick("help")} />
              <MenuRow icon={<UiIcon name="billing" size={16} />} label="Billing" onClick={() => pick("billing")} />
              <MenuRow icon={<UiIcon name="logout" size={16} />} label="Sign out" onClick={() => void handleSignOut()} />
            </div>
          ) : null}
        </div>
      </div>
      {tabMenu && typeof document !== "undefined"
          ? createPortal(
            <div
              role="menu"
              className="fixed z-[80] w-[180px] overflow-hidden rounded-xl border border-border bg-surface-2 p-1 text-[13px] text-foreground shadow-xl"
              style={{ top: tabMenu.top, left: tabMenu.left }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2.5 py-2 text-left hover:bg-foreground/10"
                onClick={() => {
                  openEditor(tabMenu.id, "rename");
                  setTabMenu(null);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2.5 py-2 text-left hover:bg-foreground/10"
                onClick={() => {
                  openEditor(tabMenu.id, "icon");
                  setTabMenu(null);
                }}
              >
                Change symbol
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2.5 py-2 text-left hover:bg-foreground/10"
                onClick={() => {
                  closeTab(tabMenu.id);
                  setTabMenu(null);
                }}
              >
                Close
              </button>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="sidebar-item-rest flex h-9 w-9 items-center justify-center rounded-xl text-foreground"
    >
      {children}
    </button>
  );
}

function MenuRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="sidebar-menu-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground"
    >
      <span className="accent-symbol">{icon}</span>
      {label}
    </button>
  );
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  if (src) return <img src={src} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] text-foreground">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
