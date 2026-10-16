"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const OPEN_KEY = "tv.openNotebooks";
const OPEN_EVENT = "tv:open-notebook-tabs";

type CachedProjectView = { projectId: string; element: ReactNode };

function readOpenProjectIds(): string[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(OPEN_KEY) || "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(-3)
      : [];
  } catch {
    return [];
  }
}

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:p|c)\/([^/]+)/);
  return match?.[1] ?? null;
}

/** Keeps up to three open project routes mounted so client-owned streams and uploads can finish in the background. */
export function ProjectTabKeepAlive({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeProjectId = projectIdFromPath(pathname);
  const latestChildren = useRef(children);
  latestChildren.current = children;
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [cachedViews, setCachedViews] = useState<CachedProjectView[]>([]);

  useEffect(() => {
    const sync = () => setOpenIds(readOpenProjectIds());
    sync();
    window.addEventListener(OPEN_EVENT, sync);
    return () => window.removeEventListener(OPEN_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    setCachedViews((current) => {
      if (current.some((view) => view.projectId === activeProjectId)) return current;
      return [...current, { projectId: activeProjectId, element: latestChildren.current }].slice(-3);
    });
  }, [activeProjectId, openIds]);

  useEffect(() => {
    setCachedViews((current) => current.filter((view) => openIds.includes(view.projectId) || view.projectId === activeProjectId));
  }, [openIds, activeProjectId]);

  const views = [...cachedViews];
  if (activeProjectId && !views.some((view) => view.projectId === activeProjectId)) {
    views.push({ projectId: activeProjectId, element: children });
  }
  const mountedViews = views.slice(-3);

  if (!activeProjectId) {
    return (
      <>
        {children}
        {mountedViews.map((view) => (
          <div key={view.projectId} className="hidden" aria-hidden="true" inert>
            {view.element}
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {mountedViews.map((view) => (
        <div key={view.projectId} className={view.projectId === activeProjectId ? "contents" : "hidden"} aria-hidden={view.projectId === activeProjectId ? undefined : "true"} inert={view.projectId === activeProjectId ? undefined : true}>
          {view.element}
        </div>
      ))}
    </>
  );
}
