"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/playground", label: "Playground" },
  { href: "/admin/eval", label: "Eval" },
  { href: "/admin/insights", label: "Insights" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Admin</p>
        <p className="text-sm text-foreground">TobyVerse control</p>
      </div>
      <nav className="flex rounded-md bg-surface p-0.5">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
