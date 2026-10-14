"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UiIcon } from "@/components/workspace/ui-icon";
import { useAuth } from "@/components/auth-provider";
import { useShell } from "@/components/workspace/shell-context";

const ITEMS = [
  { href: "/admin/reports", label: "Reports", icon: "notes" as const },
  { href: "/admin/system", label: "System", icon: "settings" as const },
  { href: "/admin/playground", label: "Playground", icon: "spark" as const },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { mobileNavOpen, setMobileNavOpen, openAccountSheet, openSettings } = useShell();
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem("tv.sidebar.collapsed") === "1");
  const name = user?.displayName || user?.email || "Account";

  function toggleCollapse() {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem("tv.sidebar.collapsed", next ? "1" : "0");
      return next;
    });
  }

  function content(mobile = false) {
    const narrow = collapsed && !mobile;
    return <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between px-3">
        <Link href="/admin/reports" className="flex h-9 items-center gap-2 text-foreground" aria-label="TobyVerse Admin">
          <span className="block h-6 w-6 bg-current" style={{ WebkitMask: "url(/logo.svg) center / contain no-repeat", mask: "url(/logo.svg) center / contain no-repeat" }} />
          {!narrow ? <span className="text-[13px] font-bold">beta</span> : null}
        </Link>
        <button type="button" onClick={mobile ? () => setMobileNavOpen(false) : toggleCollapse} aria-label={mobile ? "Close menu" : narrow ? "Expand sidebar" : "Collapse sidebar"} className="flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground"><UiIcon name={narrow ? "sidebarRight" : "sidebarLeft"} size={18} /></button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-[13px] py-2">
        {ITEMS.map((item) => {
          const active = pathname === item.href || (item.href === "/admin/playground" && pathname.startsWith("/admin/playground/"));
          return <Link key={item.href} href={item.href} title={narrow ? item.label : undefined} onClick={() => { if (mobile) setMobileNavOpen(false); }} className={`flex h-9 items-center gap-1.5 rounded-xl text-[14px] ${active ? "sidebar-item-active text-foreground" : "sidebar-item-rest text-foreground"}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-muted"><UiIcon name={item.icon} size={18} /></span>
            {!narrow ? <span className="truncate">{item.label}</span> : null}
          </Link>;
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-1 px-[13px] pb-3">
        {!narrow ? <button type="button" onClick={() => openSettings("appearance")} title="Theme" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground"><UiIcon name="appearance" size={17} /></button> : null}
        <button type="button" onClick={() => openAccountSheet("root")} title={name} className={`sidebar-item-rest flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl text-left hover:bg-surface-2 ${narrow ? "justify-center" : ""}`}>
          {user?.photoURL ? <img src={user.photoURL} alt="" className="ml-1 h-7 w-7 shrink-0 rounded-full object-cover" /> : <span className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs text-foreground">{name.charAt(0).toUpperCase()}</span>}
          {!narrow ? <span className="truncate text-[13px] text-foreground">{name}</span> : null}
        </button>
      </div>
    </div>;
  }

  return <>
    <aside className={`sidebar-slot relative z-[2] hidden h-dvh shrink-0 overflow-hidden border-r border-border bg-surface transition-[width] duration-200 ease-out md:block ${collapsed ? "w-16" : "w-[273px]"}`}>{content()}</aside>
    {mobileNavOpen ? <>
      <button type="button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-40 bg-black/50 md:hidden" />
      <aside className="fixed left-0 top-0 z-50 h-dvh w-[min(85vw,320px)] bg-surface shadow-2xl md:hidden">{content(true)}</aside>
    </> : null}
  </>;
}
