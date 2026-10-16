"use client";

import Link from "next/link";
import { PROJECT_TABS, type ProjectTabId } from "@/lib/core/constants";
import type { Project } from "@/types/project";
import { displayProjectTitle } from "@/lib/workspace/title";

export function ProjectNav({
  project,
  tab,
  onTab,
}: {
  project: Project;
  tab: ProjectTabId;
  onTab: (id: ProjectTabId) => void;
}) {
  return (
    <aside className="project-nav flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-surface-2">
      <div className="border-b border-border px-3 py-3">
        <Link href="/" className="text-[11px] font-medium tracking-tight text-foreground">
          TobyVerse
        </Link>
        <Link href="/" className="mt-2 block text-[11px] text-muted hover:text-foreground">
          ← Projects
        </Link>
        <h1 className="mt-2 truncate text-sm font-medium tracking-tight text-foreground">
          {displayProjectTitle(project.title)}
        </h1>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {PROJECT_TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTab(item.id)}
              data-active={active ? "true" : "false"}
              className={`project-nav-item flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] ${active ? "text-foreground" : "text-muted"}`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
