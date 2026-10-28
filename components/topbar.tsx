"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { writeSignedInCookie } from "@/lib/signed-in-cookie";
import { useAuth } from "@/components/auth-provider";
import { BrandMark } from "@/components/brand-mark";
import { CHAT_SEARCH_OPEN_EVENT, NOTEBOOK_CREATE_EVENT } from "@/lib/workspace/ui-events";
import { useMobileNavigation, useShell } from "@/components/workspace/shell-context";
import { UiIcon } from "@/components/workspace/ui-icon";
import { ProjectSymbol, iconSearchLabel } from "@/components/workspace/pack-icon";
import { updateProjectMeta, updateProjectTitle } from "@/lib/projects";
import { useTheme } from "@/components/workspace/theme-provider";
import { Drawer as VaulDrawer } from "vaul";
import { Drawer as VelocityDrawer } from "@/components/ui/drawer";
import { accentColor, type AccentId } from "@/lib/workspace/theme";
import { projectIconFor } from "@/lib/workspace/project-icons";
import { addOpenNotebook } from "@/lib/workspace/open-tabs";
import { positionContextMenu } from "@/lib/workspace/context-menu-position";
import { discardUntouchedNotebook } from "@/lib/workspace/discard-draft-notebook";
import { notebookTitle } from "@/lib/workspace/title";
import { useNotebooks } from "@/lib/workspace/use-notebooks";
import { activeNotebookId } from "@/lib/workspace/active-notebook-tab";
import { getActiveGenerationProjectIds, subscribeActiveGenerations } from "@/lib/workspace/live-generations";
import {
  clearProjectActivityNotificationFor,
  getProjectActivityNotifications,
  subscribeProjectActivityNotifications,
} from "@/lib/workspace/project-activity";

const SYMBOL_COLORS = ["blue", "red", "orange", "yellow", "green", "teal", "purple", "pink"] as const satisfies readonly AccentId[];

const OPEN_KEY = "tv.openNotebooks";
const NO_ACTIVE_GENERATION_PROJECTS: readonly string[] = [];

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
  const { mobileNavOpen, setMobileNavOpen, mobileSidebarContent } = useMobileNavigation();
  const { notebooks } = useNotebooks(user?.uid);
  const generatingProjects = useSyncExternalStore(
    subscribeActiveGenerations,
    getActiveGenerationProjectIds,
    () => NO_ACTIVE_GENERATION_PROJECTS,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [tabMenu, setTabMenu] = useState<{ id: string; left: number; top: number; x: number; y: number } | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [openIdsLoaded, setOpenIdsLoaded] = useState(false);
  const [activityNotifications, setActivityNotifications] = useState<string[]>([]);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorPosition, setEditorPosition] = useState<{ left: number; top: number } | null>(null);
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
        setEditorPosition(null);
        setIdentityMenuOpen(false);
      }
    }
    function closeKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setEditorId(null);
        setEditorPosition(null);
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

  function openEditor(id: string, mode: "rename" | "icon", anchor?: { x: number; y: number }) {
    const project = notebooks.find((item) => item.id === id);
    if (!project) return;
    setEditorId(id);
    setEditorPosition(anchor
      ? positionContextMenu(anchor.x, anchor.y, 288, mode === "icon" ? 340 : 120, window.innerWidth, window.innerHeight)
      : null);
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
    if (!project || !user?.uid || (editorMode === "rename" && !nextTitle)) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      if (editorMode === "rename") {
        await updateProjectTitle(project.id, user.uid, nextTitle);
      } else {
        await updateProjectMeta(project.id, user.uid, { icon: iconDraft, iconColor: accentColor(theme, iconColor) });
      }
      setEditorId(null);
      setEditorPosition(null);
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

  function closeMobileDrawer() {
    setMobileNavOpen(false);
  }

  function pick(section: Parameters<typeof openSettings>[0]) {
    setMenuOpen(false);
    openSettings(section);
  }

  return (
    <>
    <header className="mobile-topbar relative z-20 flex h-12 shrink-0 items-center gap-1 bg-background pl-2 pr-2 max-md:h-auto max-md:min-h-[46px]">
      {pathname === "/new" ? null : <button type="button" className="mobile-drawer-trigger flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground md:hidden" aria-label="Open navigation" aria-expanded={mobileNavOpen} onPointerDown={() => setMobileNavOpen(true)} onClick={() => setMobileNavOpen(true)}><UiIcon name="menu01" size={21} /></button>}
      <div className={`topbar-brand-desktop flex shrink-0 items-center ${pathname === "/new" ? "topbar-brand-new-mobile" : ""}`}><span className="flex h-9 items-center"><BrandMark href="/new" /></span></div>

      <nav aria-label="Projects" className="topbar-tabs ml-3 flex min-w-0 flex-1 items-center gap-2 overflow-x-hidden max-md:hidden">
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
                setTabMenu({ id: project.id, x: event.clientX, y: event.clientY, ...position });
              }}
            >
              <Link
                ref={isActive ? activeTabRef : undefined}
                href={`/p/${project.id}`}
                title={notebookTitle(project.title)}
                aria-current={isActive ? "page" : undefined}
                onClick={isActive ? (event) => event.preventDefault() : undefined}
                className={`sidebar-item-rest flex h-9 w-full min-w-0 items-center gap-1.5 rounded-xl pl-2.5 pr-14 text-[13px] ${
                  isActive ? "sidebar-item-active cursor-default text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <ProjectSymbol name={projectIconFor(project)} size={20} color={project.iconColor} className="shrink-0" />
                <span className="min-w-0 truncate">{notebookTitle(project.title)}</span>
              </Link>
              {generatingProjects.includes(project.id) || activityNotifications.includes(project.id) ? (
                <span
                  className={`project-tab-status ${generatingProjects.includes(project.id) ? "is-running" : "is-complete"}`}
                  role="img"
                  aria-label={generatingProjects.includes(project.id) ? "Generation in progress" : "Generation complete"}
                  title={generatingProjects.includes(project.id) ? "Generation in progress" : "Generation complete"}
                  style={{ color: project.iconColor || "var(--accent)" }}
                >
                  {generatingProjects.includes(project.id)
                    ? <span className="project-tab-status-spinner" />
                    : <span className="project-tab-status-dot" />}
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`Close ${notebookTitle(project.title)}`}
                onClick={() => closeTab(project.id)}
                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-foreground/10 hover:text-foreground"
              >
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
        {pathname === "/new" ? <>
          <button type="button" aria-label="Account" onClick={() => openAccountSheet("root")} className="flex h-9 w-9 items-center justify-center rounded-full md:hidden">
            <Avatar src={user?.photoURL} name={name} />
          </button>
          <button type="button" aria-label="New project" title="New project" onClick={() => window.dispatchEvent(new Event(NOTEBOOK_CREATE_EVENT))} className="flex h-9 w-9 items-center justify-center text-foreground md:hidden">
            <UiIcon name="plus" size={20} />
          </button>
        </> : null}
        {activeProject ? (
          <div ref={identityRef} className="mobile-project-identity relative mr-1 min-w-0 max-w-[250px] flex-1 md:flex-none">
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
              <div
                className={`${editorPosition ? "fixed" : "absolute right-0 top-full mt-1"} z-[90] w-[288px] rounded-xl border border-border bg-surface-2 p-2 text-foreground shadow-xl`}
                style={editorPosition ?? undefined}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <form onSubmit={(event) => void saveProjectIdentity(event)}>
                  {editorMode === "rename" ? (
                    <>
                      <label className="mb-1 block px-1 text-[11px] text-muted">Project name</label>
                      <input autoFocus value={titleDraft} maxLength={80} onChange={(event) => setTitleDraft(event.target.value)} aria-label="Project name" className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none" />
                    </>
                  ) : (
                    <>
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-label="Current symbol">
                          <ProjectSymbol name={iconDraft} size={20} color={accentColor(theme, iconColor)} />
                        </span>
                        <input autoFocus value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder="Search symbols" aria-label="Search symbols" className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[12px] outline-none" />
                      </div>
                      <div className="mb-2 flex items-center justify-between gap-2 px-1">
                        {SYMBOL_COLORS.map((colorId) => {
                          const color = accentColor(theme, colorId);
                          return <button key={colorId} type="button" aria-label={`${colorId} symbol color`} aria-pressed={iconColor === colorId} onClick={() => setIconColor(colorId)} className="h-4 w-4 shrink-0 rounded-full" style={{ background: color, outline: iconColor === colorId ? "2px solid var(--text)" : "none", outlineOffset: 2 }} />;
                        })}
                      </div>
                      <div className="grid max-h-[168px] grid-cols-8 gap-1 overflow-y-auto">
                        {matchingIcons.map((symbol) => (
                          <button key={symbol} type="button" aria-label={iconSearchLabel(symbol)} title={iconSearchLabel(symbol)} aria-pressed={iconDraft === symbol} onClick={() => setIconDraft(symbol)} className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-foreground/10 ${iconDraft === symbol ? "bg-foreground/10" : ""}`}>
                            <ProjectSymbol name={symbol} size={17} color={accentColor(theme, iconColor)} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {editError ? <p role="alert" className="px-1 pt-1 text-[12px] text-red-500">{editError}</p> : null}
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button type="button" onClick={() => { setEditorId(null); setEditorPosition(null); }} className="h-8 rounded-lg px-2.5 text-[12px] text-muted hover:bg-foreground/10">Cancel</button>
                    <button type="submit" disabled={savingEdit || (editorMode === "rename" && !titleDraft.trim())} className="h-8 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background disabled:opacity-50">{savingEdit ? "Saving…" : "Save"}</button>
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
            label="Project settings"
            onClick={() => setPendingPanel({ projectId: activeId, kind: "settings", id: "settings" })}
            className="mobile-phone-hide"
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
        <div ref={menuRef} className="relative mobile-phone-hide">
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
                  openEditor(tabMenu.id, "rename", tabMenu);
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
                  openEditor(tabMenu.id, "icon", tabMenu);
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
    <VelocityDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen} direction="left" modal>
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="mobile-drawer-overlay fixed inset-0 z-[99] bg-black/45" />
        <VaulDrawer.Content
          aria-label="Navigation"
          className="mobile-drawer-panel fixed inset-y-0 left-0 z-[100] flex h-dvh w-[min(82vw,320px)] max-w-[calc(100vw-56px)] flex-col overflow-hidden bg-[var(--panel-bg)] px-0 pb-[max(16px,env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))] outline-none"
        >
          <VaulDrawer.Title className="sr-only">Navigation</VaulDrawer.Title>
          <div className="flex h-12 shrink-0 items-center px-3"><BrandMark href="/new" onClick={() => closeMobileDrawer()} /></div>
          <div className="mobile-sidebar-content min-h-0 flex-1 overflow-hidden">{mobileSidebarContent}</div>
          <div className="shrink-0 px-3 pt-2"><button type="button" onClick={() => openAccountSheet("root")} className="flex h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-2"><Avatar src={user?.photoURL} name={name} /><span className="min-w-0 flex-1 truncate text-sm text-foreground">{name}</span></button></div>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VelocityDrawer>
    </>
  );
}

function IconButton({ label, onClick, children, className = "" }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`sidebar-item-rest flex h-9 w-9 items-center justify-center rounded-xl text-foreground ${className}`}
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
