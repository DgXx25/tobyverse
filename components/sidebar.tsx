"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { writeSignedInCookie } from "@/lib/signed-in-cookie";
import { subscribeProjectsForUser, listDiscardedProjectIds, PROJECT_DISCARDED_EVENT } from "@/lib/projects";
import { peekOpeningProject } from "@/lib/workspace/start-project";
import { subscribeChatThreads } from "@/lib/chats";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";
import type { ChatThread } from "@/types/chat";
import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";
import { SidebarChatRow } from "@/components/sidebar-chat-row";
import type { Project } from "@/types/project";
import { UiIcon } from "@/components/workspace/ui-icon";
import { useSidebarSwipe } from "@/lib/workspace/sidebar-swipe";

const COLLAPSE_KEY = "tv.sidebar.collapsed";

function readCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSE_KEY) === "1";
}

function blurActive() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

export function Sidebar() {
  const { sidebarHidden, mobileNavOpen, setMobileNavOpen } = useShell();
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const [sheetMounted, setSheetMounted] = useState(mobileNavOpen);
  const railRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLButtonElement>(null);

  const setCollapsed = useCallback((value: boolean) => {
    blurActive();
    setCollapsedState(value);
    window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  }, []);
  const collapseRail = useCallback(() => setCollapsed(true), [setCollapsed]);
  const expandRail = useCallback(() => setCollapsed(false), [setCollapsed]);
  const closeSheet = useCallback(() => setMobileNavOpen(false), [setMobileNavOpen]);

  useSidebarSwipe({
    panel: railRef,
    enabled: !sidebarHidden,
    kind: "rail",
    collapsed,
    onCollapse: collapseRail,
    onExpand: expandRail,
  });
  useSidebarSwipe({
    panel: sheetRef,
    overlay: overlayRef,
    enabled: mobileNavOpen && sheetMounted,
    kind: "sheet",
    onCollapse: closeSheet,
  });

  useEffect(() => {
    const root = document.documentElement;
    if (!mobileNavOpen) {
      root.classList.remove("nav-lock");
      return;
    }
    root.classList.add("nav-lock");
    return () => root.classList.remove("nav-lock");
  }, [mobileNavOpen]);

  useEffect(() => {
    if (mobileNavOpen) {
      setSheetMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setSheetMounted(false), 220);
    return () => window.clearTimeout(timer);
  }, [mobileNavOpen]);

  return (
    <>
      <div
        ref={railRef}
        className={`sidebar-slot relative z-[2] hidden h-dvh shrink-0 touch-pan-y overflow-hidden bg-surface md:block ${
          sidebarHidden
            ? "pointer-events-none w-0 border-r-0"
            : collapsed
              ? "sidebar-collapsed w-[64px] border-r border-border"
              : "w-[273px] border-r border-border"
        }`}
      >
        <SidebarFrame
          collapsed={collapsed}
          onCollapse={collapseRail}
          onExpand={expandRail}
        />
      </div>

      <div className="md:hidden">
        {sheetMounted ? (
          <>
            {mobileNavOpen ? (
              <button
                ref={overlayRef}
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-40 bg-black/50"
                onClick={closeSheet}
              />
            ) : null}
            <div
              ref={sheetRef}
              className={`fixed left-0 top-0 z-50 h-dvh w-[min(85vw,320px)] touch-pan-y overflow-hidden bg-surface pt-[env(safe-area-inset-top,0px)] shadow-2xl transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                mobileNavOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
              }`}
              aria-hidden={!mobileNavOpen}
              inert={mobileNavOpen ? undefined : true}
            >
              <SidebarFrame
                collapsed={false}
                mobile
                onCollapse={closeSheet}
                onExpand={() => setMobileNavOpen(true)}
                onNavigate={closeSheet}
              />
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function SidebarFrame({
  collapsed,
  mobile = false,
  onCollapse,
  onExpand,
  onNavigate,
}: {
  collapsed: boolean;
  mobile?: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { openSettings, openAccountSheet } = useShell();
  const [projects, setProjects] = useState<Project[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(() => listDiscardedProjectIds());
  const [held, setHeld] = useState<Project | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatMenuId, setChatMenuId] = useState<string | null>(null);
  const [childThreads, setChildThreads] = useState<ChatThread[]>([]);
  const [flyoutPos, setFlyoutPos] = useState<{ left: number; bottom: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pfpRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    setHiddenIds(new Set());
    setDiscardedIds(listDiscardedProjectIds());
    return subscribeProjectsForUser(user.uid, setProjects);
  }, [user]);

  useEffect(() => {
    function onDiscarded(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id !== "string" || !id) return;
      setDiscardedIds((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
    }
    window.addEventListener(PROJECT_DISCARDED_EVENT, onDiscarded);
    return () => window.removeEventListener(PROJECT_DISCARDED_EVENT, onDiscarded);
  }, []);

  useEffect(() => {
    if (collapsed) {
      setChatMenuId(null);
      setMenuOpen(false);
    }
  }, [collapsed]);

  useEffect(() => {
    const projectId = pathname.startsWith("/project/") ? pathname.split("/")[2] : null;
    if (!projectId) {
      setChildThreads([]);
      return;
    }
    return subscribeChatThreads(projectId, (threads) => {
      setChildThreads(
        threads.filter((item) => item.id !== DEFAULT_CHAT_THREAD_ID && item.kind !== "main"),
      );
    });
  }, [pathname]);

  const firstPath = useRef(true);
  useEffect(() => {
    if (!mobile) return;
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    onNavigate?.();
    // onNavigate is an inline closer; only run when the route actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, mobile]);

  const onChatMenuOpen = useCallback((id: string | null) => {
    setMenuOpen(false);
    setChatMenuId(id);
  }, []);

  const onChatHold = useCallback((project: Project | null) => {
    setHeld(project);
  }, []);

  const onChatDeleted = useCallback((id: string) => {
    setHeld((current) => (current?.id === id ? null : current));
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setChatMenuId((current) => (current === id ? null : current));
  }, []);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || flyoutRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useLayoutEffect(() => {
    if (!collapsed || !menuOpen || !pfpRef.current) {
      setFlyoutPos(null);
      return;
    }
    function place() {
      const rect = pfpRef.current?.getBoundingClientRect();
      if (!rect) return;
      setFlyoutPos({
        left: Math.round(rect.right + 8),
        bottom: Math.round(window.innerHeight - rect.bottom),
      });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [collapsed, menuOpen]);

  useEffect(() => {
    if (!mobile) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCollapse();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile, onCollapse]);

  async function handleSignOut() {
    await signOut(getFirebaseAuth());
    writeSignedInCookie(false);
    router.replace("/login");
  }

  const activeProjectId = pathname.startsWith("/project/") ? pathname.split("/")[2] : null;
  const activeThreadId = pathname.startsWith("/project/") ? pathname.split("/")[3] || DEFAULT_CHAT_THREAD_ID : null;
  const startActive = pathname === "/" || pathname === "/new";
  const libraryActive = pathname === "/library" || pathname.startsWith("/library/");
  const name = user?.isAnonymous ? "Guest" : user?.displayName || user?.email || "Signed in";
  const guest = Boolean(user?.isAnonymous);
  const visibleProjects = projects.filter(
    (project) => !hiddenIds.has(project.id) && !discardedIds.has(project.id),
  );
  const opening = activeProjectId ? peekOpeningProject(activeProjectId) : null;
  const withOpening =
    opening &&
    !visibleProjects.some((project) => project.id === opening.id) &&
    !hiddenIds.has(opening.id) &&
    !discardedIds.has(opening.id)
      ? [opening, ...visibleProjects]
      : visibleProjects;
  const chats =
    held && !withOpening.some((project) => project.id === held.id) && !hiddenIds.has(held.id)
      ? [...withOpening, held]
      : withOpening;

  const labelFade = "sidebar-label min-w-0 truncate text-[14px] font-normal text-foreground";

  return (
    <aside className="flex h-full w-[273px] min-w-[273px] flex-col max-md:w-full max-md:min-w-0">
      <div className="relative h-12 shrink-0">
        <div className="absolute left-[13px] top-1/2 z-[1] flex -translate-y-1/2 items-center gap-1.5">
          <Link
            href="/"
            draggable={false}
            aria-label={collapsed ? "Expand sidebar" : "TobyVerse"}
            title={collapsed ? "Expand sidebar" : undefined}
            onDragStart={(event) => event.preventDefault()}
            onClick={(event) => {
              if (mobile) {
                onNavigate?.();
                return;
              }
              if (!collapsed) return;
              event.preventDefault();
              onExpand();
            }}
            className="sidebar-brand relative flex h-9 w-9 select-none items-center justify-center rounded-xl text-foreground hover:bg-surface-2"
          >
            <span
              className="sidebar-brand-logo accent-symbol pointer-events-none block h-6 w-6 bg-current"
              style={{
                WebkitMask: "url(/logo.svg) center / contain no-repeat",
                mask: "url(/logo.svg) center / contain no-repeat",
              }}
            />
            <UiIcon
              name="panel"
              size={18}
              className="sidebar-brand-toggle pointer-events-none absolute opacity-0"
            />
          </Link>
          <span className="sidebar-label text-[13px] font-bold leading-none text-foreground">beta</span>
        </div>
        <div className="absolute right-3 top-1/2 z-[1] flex -translate-y-1/2 items-center gap-0.5">
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              onCollapse();
            }}
            className="sidebar-collapse-btn flex h-8 w-8 items-center justify-center rounded-xl text-foreground hover:bg-surface-2"
            aria-label={mobile ? "Close menu" : "Collapse sidebar"}
          >
            <UiIcon name="panel" size={18} />
          </button>
        </div>
      </div>

      <nav className="sidebar-rail flex shrink-0 flex-col gap-0.5 px-1.5 pb-2">
        <NavLink
          href="/new"
          title="New"
          active={startActive}
          icon={
            <span className="flex h-8 w-8 shrink-0 items-center justify-center text-accent">
              <UiIcon name="plus" size={18} />
            </span>
          }
          onNavigate={onNavigate}
        >
          <span className={labelFade}>New</span>
        </NavLink>
        {!guest ? (
        <NavLink
          href="/library"
          title="Library"
          active={libraryActive}
          icon={
            <span className="flex h-8 w-8 shrink-0 items-center justify-center text-accent">
              <UiIcon name="library" size={18} />
            </span>
          }
          onNavigate={onNavigate}
        >
          <span className={labelFade}>Library</span>
        </NavLink>
        ) : null}
      </nav>

      <nav
        className="sidebar-label min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto px-1.5 pb-2"
        onClick={(event) => {
          if (!onNavigate) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest("a")) onNavigate();
        }}
      >
        {chats.length > 0 && (
          <p className={`px-[13px] pb-1 pt-2 text-[13px] text-muted ${mobile ? "uppercase tracking-wide" : ""}`}>
            {mobile ? "CHATS" : "Chats"}
          </p>
        )}
        {chats.map((project) => (
          <div key={project.id}>
            <SidebarChatRow
              project={project}
              userId={user?.uid ?? ""}
              active={project.id === activeProjectId}
              menuOpen={chatMenuId === project.id}
              onMenuOpen={onChatMenuOpen}
              onHold={onChatHold}
              onDeleted={onChatDeleted}
            />
            {project.id === activeProjectId && childThreads.length > 0
              ? childThreads.map((thread) => (
                  <Link
                    key={thread.id}
                    href={`/project/${project.id}/${thread.id}`}
                    className={`sidebar-label ml-6 flex h-8 items-center rounded-xl px-2.5 text-[13px] ${
                      activeThreadId === thread.id ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <span className="min-w-0 truncate">{thread.title || (thread.kind === "path" ? "გეგმა" : "Chat")}</span>
                  </Link>
                ))
              : null}
          </div>
        ))}
      </nav>

        <div className="sidebar-rail relative mt-auto px-1.5 pb-3 max-md:pb-[max(12px,env(safe-area-inset-bottom,0px))]" ref={menuRef}>
        {!mobile && menuOpen && !collapsed && (
          <AccountMenu
            email={user?.email}
            onAccount={() => {
              setMenuOpen(false);
              openSettings("account");
            }}
            onSettings={() => {
              setMenuOpen(false);
              openSettings("appearance");
            }}
            onHelp={() => {
              setMenuOpen(false);
              openSettings("help");
            }}
            onBilling={() => {
              setMenuOpen(false);
              openSettings("billing");
            }}
            onSignOut={() => void handleSignOut()}
            className="absolute bottom-14 left-2 right-2 z-30"
          />
        )}
        <button
          ref={pfpRef}
          type="button"
          onClick={() => {
            if (guest) {
              if (mobile) onNavigate?.();
              router.push("/login");
              return;
            }
            if (mobile) {
              openAccountSheet("root");
              return;
            }
            setChatMenuId(null);
            setMenuOpen((open) => !open);
          }}
          className="sidebar-rail-item flex h-9 w-full items-center gap-1.5 rounded-xl px-[13px] text-left hover:bg-surface-2"
        >
          <Avatar src={user?.photoURL} name={name} />
          <span className={labelFade}>{name}</span>
        </button>
      </div>
      {!mobile && menuOpen && collapsed && flyoutPos && typeof document !== "undefined"
        ? createPortal(
            <AccountMenu
              ref={flyoutRef}
              email={user?.email}
              onAccount={() => {
                setMenuOpen(false);
                openSettings("account");
              }}
              onSettings={() => {
                setMenuOpen(false);
                openSettings("appearance");
              }}
              onHelp={() => {
                setMenuOpen(false);
                openSettings("help");
              }}
              onBilling={() => {
                setMenuOpen(false);
                openSettings("billing");
              }}
              onSignOut={() => void handleSignOut()}
              className="fixed z-50 w-[220px]"
              style={{ left: flyoutPos.left, bottom: flyoutPos.bottom }}
            />,
            document.body,
          )
        : null}
    </aside>
  );
}

function NavLink({
  href,
  title,
  active,
  icon,
  children,
  onNavigate,
}: {
  href: string;
  title: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      title={title}
      onClick={onNavigate}
      className={`sidebar-rail-item flex h-9 items-center gap-1.5 rounded-xl px-[13px] text-[14px] font-normal text-foreground ${
        active ? "bg-surface-2" : "hover:bg-surface-2"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function AccountMenu({
  email,
  onAccount,
  onSettings,
  onHelp,
  onBilling,
  onSignOut,
  className,
  style,
  ref,
}: {
  email?: string | null;
  onAccount: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onBilling: () => void;
  onSignOut: () => void;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      style={style}
      className={`overflow-hidden rounded-xl border border-border bg-surface-2 p-1 shadow-xl ${className ?? ""}`}
    >
      <p className="truncate px-2.5 py-2 text-[11px] text-muted">{email}</p>
      <MenuRow icon={<UiIcon name="user" size={16} />} label="Account" onClick={onAccount} />
      <MenuRow icon={<UiIcon name="settings" size={16} />} label="Settings" onClick={onSettings} />
      <MenuRow icon={<UiIcon name="help" size={16} />} label="Help" onClick={onHelp} />
      <MenuRow icon={<UiIcon name="billing" size={16} />} label="Billing" onClick={onBilling} />
      <MenuRow icon={<UiIcon name="logout" size={16} />} label="Sign out" onClick={onSignOut} />
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)]"
    >
      <span className="accent-symbol">{icon}</span>
      {label}
    </button>
  );
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    return <img src={src} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] text-foreground">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
