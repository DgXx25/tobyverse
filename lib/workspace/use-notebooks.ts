"use client";

import { useEffect, useMemo, useState } from "react";
import { listDiscardedProjectIds, PROJECT_DISCARDED_EVENT, subscribeProjectsForUser } from "@/lib/projects";
import type { Project } from "@/types/project";

type NotebookSnapshot = { items: Project[]; ready: boolean };
type SharedNotebookStore = {
  snapshot: NotebookSnapshot;
  listeners: Set<(snapshot: NotebookSnapshot) => void>;
  unsubscribe?: () => void;
  cleanupVersion: number;
};

const notebookStores = new Map<string, SharedNotebookStore>();

function publish(store: SharedNotebookStore, snapshot: NotebookSnapshot): void {
  store.snapshot = snapshot;
  for (const listener of [...store.listeners]) listener(snapshot);
}

function subscribeToNotebooks(userId: string, listener: (snapshot: NotebookSnapshot) => void): () => void {
  let store = notebookStores.get(userId);
  if (!store) {
    store = { snapshot: { items: [], ready: false }, listeners: new Set(), cleanupVersion: 0 };
    notebookStores.set(userId, store);
  }

  store.cleanupVersion += 1;
  store.listeners.add(listener);
  listener(store.snapshot);
  if (!store.unsubscribe) {
    store.unsubscribe = subscribeProjectsForUser(
      userId,
      (items) => publish(store!, { items, ready: true }),
      () => publish(store!, { items: store!.snapshot.items, ready: true }),
      { waitForServer: true },
    );
  }

  return () => {
    store!.listeners.delete(listener);
    store!.cleanupVersion += 1;
    const cleanupVersion = store!.cleanupVersion;
    queueMicrotask(() => {
      if (store!.listeners.size > 0 || store!.cleanupVersion !== cleanupVersion) return;
      store!.unsubscribe?.();
      store!.unsubscribe = undefined;
      if (notebookStores.get(userId) === store) notebookStores.delete(userId);
    });
  };
}

function stamp(project: Project): number {
  const value = Date.parse(project.updatedAt || project.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

/** The signed-in user's notebooks, newest activity first. Consumers share one Firestore listener per user. */
export function useNotebooks(userId: string | undefined): { notebooks: Project[]; ready: boolean } {
  const [snapshot, setSnapshot] = useState<{ userId: string; value: NotebookSnapshot }>({
    userId: "",
    value: { items: [], ready: false },
  });
  const [discarded, setDiscarded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDiscarded(listDiscardedProjectIds());
    const onDiscard = () => setDiscarded(listDiscardedProjectIds());
    window.addEventListener(PROJECT_DISCARDED_EVENT, onDiscard);
    return () => window.removeEventListener(PROJECT_DISCARDED_EVENT, onDiscard);
  }, []);

  useEffect(() => {
    if (!userId) {
      setSnapshot({ userId: "", value: { items: [], ready: false } });
      return;
    }
    return subscribeToNotebooks(userId, (value) => setSnapshot({ userId, value }));
  }, [userId]);

  const current = snapshot.userId === userId ? snapshot.value : { items: [], ready: false };
  const notebooks = useMemo(
    () => current.items.filter((project) => !project.hidden && !discarded.has(project.id)).sort((a, b) => stamp(b) - stamp(a)),
    [current.items, discarded],
  );
  return { notebooks, ready: current.ready };
}
