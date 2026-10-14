"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { writeSignedInCookie } from "@/lib/signed-in-cookie";
import { useAuth } from "@/components/auth-provider";
import { BrandMark } from "@/components/brand-mark";
import { CHAT_SEARCH_OPEN_EVENT } from "@/components/chat-search";
import { useShell } from "@/components/workspace/shell-context";
import { UiIcon } from "@/components/workspace/ui-icon";
import { projectIconFor } from "@/lib/workspace/project-icons";
import { notebookTitle } from "@/lib/workspace/title";
import { useNotebooks } from "@/lib/workspace/use-notebooks";

const OPEN_KEY = "tv.openNotebooks";

function readOpen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(OPEN_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeOpen(ids: string[]) {
  try {
    window.sessionStorage.setItem(OPEN_KEY, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
}

/** Which notebook the URL points at: /p/:id, or /c/:id for the notebook's main chat. */
function activeNotebookId(pathname: string): string | null {
  if (pathname.startsWith("/p/") || pathname.startsWith("/c/")) return pathname.split("/")[2] ?? null;
  return null;
}

export function Topbar() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { openSettings, openAccountSheet, mobileTopActions, setSelectedProjectId, setPendingPanel, projectShare } = useShell();
  const { notebooks } = useNotebooks(user?.uid);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  const activeId = activeNotebookId(pathname);
  const active = notebooks.find((item) => item.id === activeId) ?? null;
  const homeActive = pathname === "/new";
  const libraryActive = pathname === "/library" || pathname.startsWith("/library/");
  const name = user?.displayName || user?.email || "Account";

  useEffect(() => {
    setSelectedProjectId(activeId);
  }, [activeId, setSelectedProjectId]);

  useEffect(() => {
    setOpenIds(readOpen());
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setOpenIds((current) => {
      if (current.includes(activeId)) return current;
      const next = [...current, activeId];
      writeOpen(next);
      return next;
    });
  }, [activeId]);

  useEffect(() => {
    router.prefetch("/new");
  }, [router]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, notebooks.length]);

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
    writeOpen(next);
    if (id !== activeId) return;
    const fallback = next[next.length - 1];
    router.push(fallback ? `/p/${fallback}` : "/new");
  }

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
    <header className="mobile-topbar relative z-20 flex h-12 shrink-0 items-center gap-1 bg-surface px-2 max-md:h-auto max-md:min-h-[48px]">
      <div className="flex shrink-0 items-center">
        <span className="flex h-9 w-9 items-center justify-center">
          <BrandMark href="/new" />
        </span>
      </div>

      <Link
        href="/new"
        title="All notebooks"
        aria-label="All notebooks"
        aria-current={homeActive ? "page" : undefined}
        className={`sidebar-item-rest flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] text-foreground max-md:hidden ${
          homeActive ? "sidebar-item-active" : ""
        }`}
      >
        <UiIcon name="notes" size={16} className="accent-symbol" />
        <span>Notebooks</span>
      </Link>

      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border max-md:hidden" />

      <nav aria-label="Notebooks" className="topbar-tabs flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto max-md:hidden">
        {openIds.map((id) => {
          const project = notebooks.find((item) => item.id === id);
          if (!project) return null;
          const isActive = project.id === activeId;
          return (
            <span key={project.id} className="group relative flex max-w-[200px] shrink-0">
              <Link
                ref={isActive ? activeTabRef : undefined}
                href={`/p/${project.id}`}
                title={notebookTitle(project.title)}
                aria-current={isActive ? "page" : undefined}
                className={`sidebar-item-rest flex h-9 min-w-0 items-center gap-1.5 rounded-xl pl-2.5 pr-7 text-[13px] ${
                  isActive ? "sidebar-item-active text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <UiIcon name={projectIconFor(project)} size={15} className="shrink-0" />
                <span className="min-w-0 truncate">{notebookTitle(project.title)}</span>
              </Link>
              <button
                type="button"
                aria-label={`Close ${notebookTitle(project.title)}`}
                onClick={() => closeTab(project.id)}
                className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                <UiIcon name="close" size={13} />
              </button>
            </span>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1 truncate px-1 text-[14px] font-medium tracking-tight text-foreground md:hidden">
        {active ? notebookTitle(active.title) : "Notebooks"}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <span className="md:hidden">{mobileTopActions}</span>
        <IconButton label="Search" onClick={() => window.dispatchEvent(new Event(CHAT_SEARCH_OPEN_EVENT))}>
          <UiIcon name="search" size={17} />
        </IconButton>
        {activeId ? (
          <IconButton
            label="Notebook settings"
            onClick={() => setPendingPanel({ projectId: activeId, kind: "settings", id: "settings" })}
          >
            <UiIcon name="settings" size={17} />
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
