"use client";

import { useEffect, useMemo, useState } from "react";
import { listDiscardedProjectIds, PROJECT_DISCARDED_EVENT, subscribeProjectsForUser } from "@/lib/projects";
import type { Project } from "@/types/project";

function stamp(project: Project): number {
  const value = Date.parse(project.updatedAt || project.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

/** The signed-in user's notebooks, newest activity first. One subscription per consumer. */
export function useNotebooks(userId: string | undefined): { notebooks: Project[]; ready: boolean } {
  const [items, setItems] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [discarded, setDiscarded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDiscarded(listDiscardedProjectIds());
    const onDiscard = () => setDiscarded(listDiscardedProjectIds());
    window.addEventListener(PROJECT_DISCARDED_EVENT, onDiscard);
    return () => window.removeEventListener(PROJECT_DISCARDED_EVENT, onDiscard);
  }, []);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setReady(false);
      return;
    }
    return subscribeProjectsForUser(
      userId,
      (next) => {
        setItems(next);
        setReady(true);
      },
      () => setReady(true),
    );
  }, [userId]);

  const notebooks = useMemo(
    () => items.filter((project) => !project.hidden && !discarded.has(project.id)).sort((a, b) => stamp(b) - stamp(a)),
    [items, discarded],
  );
  return { notebooks, ready };
}
