"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/admin/constants";
import { subscribeProjectsForUser } from "@/lib/projects";
import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";
import { SidebarChatRow } from "@/components/sidebar-chat-row";
import type { Project } from "@/types/project";
import {
  IconAdmin,
  IconGear,
  IconHelp,
  IconLibrary,
  IconPlus,
  IconSidebar,
  IconSignOut,
  IconUpgrade,
} from "@/components/workspace/icons";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { collapsed, setCollapsed, sidebarHidden, openSettings } = useShell();
  const admin = isAdminEmail(user?.email);
  const [projects, setProjects] = useState<Project[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatMenuId, setChatMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeProjectsForUser(user.uid, setProjects);
  }, [user]);

  useEffect(() => {
    if (collapsed || sidebarHidden) setChatMenuId(null);
  }, [collapsed, sidebarHidden]);

  const onChatMenuOpen = useCallback((id: string | null) => {
    setMenuOpen(false);
    setChatMenuId(id);
  }, []);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function handleSignOut() {
    await signOut(getFirebaseAuth());
    router.replace("/login");
  }

  const activeProjectId = pathname.startsWith("/project/") ? pathname.split("/")[2] : null;
  const startActive = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const libraryActive = pathname === "/library" || pathname.startsWith("/library/");
  const adminActive = pathname.startsWith("/admin");
  const name = user?.displayName || user?.email || "Signed in";

  return (
    <aside
      className={`relative z-[1] flex h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width,opacity] duration-[220ms] ease-[ease] ${
        sidebarHidden ? "pointer-events-none w-0 border-r-0 opacity-0" : collapsed ? "w-14" : "w-[260px]"
      }`}
    >
      <div className={`flex h-12 shrink-0 items-center ${collapsed ? "justify-center px-0" : "justify-between px-3"}`}>
        {!collapsed && (
          <Link href="/dashboard" className="text-sm font-medium tracking-tight text-foreground">
            TobyVerse
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconSidebar />
        </button>
      </div>

      <nav className="flex shrink-0 flex-col gap-0.5 px-2 pb-2">
        <NavLink href="/dashboard" title="New" active={startActive} collapsed={collapsed} icon={<IconPlus className="h-4 w-4 shrink-0" />}>
          New
        </NavLink>
        <NavLink href="/library" title="Library" active={libraryActive} collapsed={collapsed} icon={<IconLibrary className="h-4 w-4 shrink-0" />}>
          Library
        </NavLink>
        {admin && (
          <NavLink href="/admin/playground" title="Admin" active={adminActive} collapsed={collapsed} icon={<IconAdmin className="h-4 w-4 shrink-0" />}>
            Admin
          </NavLink>
        )}
      </nav>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {!collapsed && projects.length > 0 && (
          <p className="px-2.5 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-muted">Chats</p>
        )}
        {projects.map((project) => (
          <SidebarChatRow
            key={project.id}
            project={project}
            userId={user?.uid ?? ""}
            active={project.id === activeProjectId}
            collapsed={collapsed}
            menuOpen={chatMenuId === project.id}
            onMenuOpen={onChatMenuOpen}
          />
        ))}
      </nav>

      <div className="relative mt-auto px-2 pb-3" ref={menuRef}>
        {menuOpen && (
          <div
            className={`absolute z-30 overflow-hidden rounded-xl border border-border bg-surface-2 py-1 shadow-xl ${
              collapsed ? "bottom-12 left-12 w-56" : "bottom-14 left-2 right-2"
            }`}
          >
            <p className="truncate px-3 py-2 text-[11px] text-muted">{user?.email}</p>
            <MenuRow
              icon={<IconGear />}
              label="Settings"
              onClick={() => {
                setMenuOpen(false);
                openSettings("account");
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
              icon={<IconUpgrade />}
              label="Upgrade"
              onClick={() => {
                setMenuOpen(false);
                openSettings("upgrade");
              }}
            />
            <MenuRow icon={<IconSignOut />} label="Sign out" onClick={() => void handleSignOut()} />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setChatMenuId(null);
            setMenuOpen((open) => !open);
          }}
          className={`flex w-full items-center rounded-lg px-1.5 py-1.5 text-left hover:bg-surface-2 ${
            collapsed ? "justify-center" : "gap-2"
          }`}
        >
          <Avatar src={user?.photoURL} name={name} />
          {!collapsed && <span className="min-w-0 truncate text-[13px] text-foreground">{name}</span>}
        </button>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  title,
  active,
  collapsed,
  icon,
  children,
}: {
  href: string;
  title: string;
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={`flex items-center rounded-md text-[13px] transition-colors ${
        collapsed ? "h-9 justify-center" : "gap-2 px-2.5 py-1.5"
      } ${
        active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {icon}
      {!collapsed && <span>{children}</span>}
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
      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-surface-2"
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
