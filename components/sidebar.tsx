"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { subscribeProjectsForUser } from "@/lib/projects";
import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";
import { SidebarChatRow } from "@/components/sidebar-chat-row";
import type { Project } from "@/types/project";
import {
  IconGear,
  IconHelp,
  IconLibrary,
  IconPlus,
  IconSidebar,
  IconSignOut,
  IconAccount,
  IconBilling,
} from "@/components/workspace/icons";

export function Sidebar() {
  const { collapsed, setCollapsed, sidebarHidden, mobileNavOpen, setMobileNavOpen } = useShell();

  return (
    <>
      <div
        className={`relative z-[2] hidden h-dvh shrink-0 overflow-hidden bg-surface transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] md:block ${
          sidebarHidden
            ? "pointer-events-none w-0 border-r-0"
            : collapsed
              ? "sidebar-collapsed w-[64px] border-r border-border"
              : "w-[273px] border-r border-border"
        }`}
      >
        <SidebarFrame
          collapsed={collapsed}
          onCollapse={() => setCollapsed(true)}
          onExpand={() => setCollapsed(false)}
        />
      </div>

      <div className="md:hidden">
        {mobileNavOpen ? (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}
        <div
          className={`fixed left-0 top-0 z-50 h-dvh w-[min(85vw,320px)] overflow-hidden bg-surface pt-[env(safe-area-inset-top,0px)] shadow-2xl transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            mobileNavOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
          }`}
          aria-hidden={!mobileNavOpen}
          inert={mobileNavOpen ? undefined : true}
        >
          <SidebarFrame
            collapsed={false}
            mobile
            onCollapse={() => setMobileNavOpen(false)}
            onExpand={() => setMobileNavOpen(true)}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </div>
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
  const [held, setHeld] = useState<Project | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatMenuId, setChatMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    setHiddenIds(new Set());
    return subscribeProjectsForUser(user.uid, setProjects);
  }, [user]);

  useEffect(() => {
    if (collapsed) {
      setChatMenuId(null);
      setMenuOpen(false);
    }
  }, [collapsed]);

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
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
    router.replace("/login");
  }

  const activeProjectId = pathname.startsWith("/project/") ? pathname.split("/")[2] : null;
  const startActive = pathname === "/" || pathname === "/new";
  const libraryActive = pathname === "/library" || pathname.startsWith("/library/");
  const name = user?.displayName || user?.email || "Signed in";
  const visibleProjects = projects.filter((project) => !hiddenIds.has(project.id));
  const chats =
    held && !visibleProjects.some((project) => project.id === held.id) && !hiddenIds.has(held.id)
      ? [...visibleProjects, held]
      : visibleProjects;

  const iconBtn = "flex h-[25px] w-[25px] shrink-0 items-center justify-center";
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
              className="sidebar-brand-logo pointer-events-none block h-6 w-6 bg-current transition-opacity duration-150"
              style={{
                WebkitMask: "url(/logo.svg) center / contain no-repeat",
                mask: "url(/logo.svg) center / contain no-repeat",
              }}
            />
            <IconSidebar className="sidebar-brand-toggle pointer-events-none absolute h-[18px] w-[18px] opacity-0 transition-opacity duration-150" />
          </Link>
          <span className="sidebar-label text-[13px] font-bold leading-none text-foreground">beta</span>
        </div>
        <div className="absolute right-3 top-1/2 z-[1] flex -translate-y-1/2 items-center gap-0.5">
          <button
            type="button"
            onClick={onCollapse}
            className="sidebar-collapse-btn flex h-8 w-8 items-center justify-center rounded-xl text-foreground hover:bg-surface-2"
            aria-label={mobile ? "Close menu" : "Collapse sidebar"}
          >
            <IconSidebar className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <nav className="sidebar-rail flex shrink-0 flex-col gap-0.5 px-1.5 pb-2">
        <NavLink
          href="/"
          title="New"
          active={startActive}
          icon={
            <span className={iconBtn}>
              <IconPlus className="h-[17px] w-[17px]" />
            </span>
          }
          onNavigate={onNavigate}
        >
          <span className={labelFade}>New</span>
        </NavLink>
        <NavLink
          href="/library"
          title="Library"
          active={libraryActive}
          icon={
            <span className={iconBtn}>
              <IconLibrary className="h-[17px] w-[17px]" />
            </span>
          }
          onNavigate={onNavigate}
        >
          <span className={labelFade}>Library</span>
        </NavLink>
      </nav>

      <nav
        className="sidebar-label min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto px-1.5 pb-2"
        style={{ scrollbarGutter: "stable" }}
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
          <SidebarChatRow
            key={project.id}
            project={project}
            userId={user?.uid ?? ""}
            active={project.id === activeProjectId}
            menuOpen={chatMenuId === project.id}
            onMenuOpen={onChatMenuOpen}
            onHold={onChatHold}
            onDeleted={onChatDeleted}
          />
        ))}
      </nav>

        <div className="sidebar-rail relative mt-auto px-1.5 pb-3 max-md:pb-[max(12px,env(safe-area-inset-bottom,0px))]" ref={menuRef}>
        {!mobile && menuOpen && (
          <div className="absolute bottom-14 left-2 right-2 z-30 overflow-hidden rounded-xl border border-border bg-surface-2 p-1 shadow-xl">
            <p className="truncate px-2.5 py-2 text-[11px] text-muted">{user?.email}</p>
            <MenuRow
              icon={<IconAccount />}
              label="Account"
              onClick={() => {
                setMenuOpen(false);
                openSettings("account");
              }}
            />
            <MenuRow
              icon={<IconGear />}
              label="Settings"
              onClick={() => {
                setMenuOpen(false);
                openSettings("appearance");
              }}
            />
            <MenuRow
              icon={<IconHelp />}
              label="Help"
              onClick={() => {
                setMenuOpen(false);
                openSettings("help");
              }}
            />
            <MenuRow
              icon={<IconBilling />}
              label="Billing"
              onClick={() => {
                setMenuOpen(false);
                openSettings("billing");
              }}
            />
            <MenuRow icon={<IconSignOut />} label="Sign out" onClick={() => void handleSignOut()} />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (mobile) {
              openAccountSheet("root");
              return;
            }
            if (collapsed) return;
            setChatMenuId(null);
            setMenuOpen((open) => !open);
          }}
          className="sidebar-rail-item flex h-9 w-full items-center gap-1.5 rounded-xl px-[13px] text-left hover:bg-surface-2"
        >
          <Avatar src={user?.photoURL} name={name} />
          <span className={labelFade}>{name}</span>
        </button>
      </div>
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
      className={`sidebar-rail-item flex h-9 items-center gap-1.5 rounded-xl px-[13px] text-[14px] font-normal text-foreground transition-colors ${
        active ? "bg-surface-2" : "hover:bg-surface-2"
      }`}
    >
      {icon}
      {children}
    </Link>
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
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-foreground hover:bg-foreground/[0.08]"
    >
      <span className="text-muted">{icon}</span>
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
