export const MAX_ACTIVE_NAVIGATION_GENERATIONS = 3;

export type LiveGeneration<T> = {
  key: string;
  projectId: string;
  threadId: string;
  controller: AbortController;
  stream: T | null;
};

type Listener = () => void;
type StreamUpdate<T> = T | null | ((current: T | null) => T | null);

// Keep active responses outside route component trees so SPA navigation can
// unmount a project view without losing its stream or abort controller.
const activeGenerations = new Map<string, LiveGeneration<unknown>>();
const conversationListeners = new Map<string, Set<Listener>>();
const activeListeners = new Set<Listener>();
let activeProjectIdsSnapshot: readonly string[] = [];

export function makeLiveGenerationKey(projectId: string, threadId: string): string {
  return JSON.stringify([projectId, threadId]);
}

export function getLiveGeneration<T>(key: string): LiveGeneration<T> | null {
  return (activeGenerations.get(key) as LiveGeneration<T> | undefined) ?? null;
}

export function subscribeLiveGeneration(key: string, listener: Listener): () => void {
  const listeners = conversationListeners.get(key) ?? new Set<Listener>();
  listeners.add(listener);
  conversationListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) conversationListeners.delete(key);
  };
}

export function getActiveGenerationProjectIds(): readonly string[] {
  return activeProjectIdsSnapshot;
}

export function getActiveGenerationCount(): number {
  return activeGenerations.size;
}

export function subscribeActiveGenerations(listener: Listener): () => void {
  activeListeners.add(listener);
  return () => activeListeners.delete(listener);
}

export function beginLiveGeneration<T>(input: {
  key: string;
  projectId: string;
  threadId: string;
  controller: AbortController;
  stream: T;
}): boolean {
  if (activeGenerations.has(input.key) || activeGenerations.size >= MAX_ACTIVE_NAVIGATION_GENERATIONS) return false;
  activeGenerations.set(input.key, input);
  notifyConversation(input.key);
  refreshActiveProjectIds();
  return true;
}

export function updateLiveGeneration<T>(
  key: string,
  controller: AbortController,
  update: StreamUpdate<T>,
): boolean {
  const current = getLiveGeneration<T>(key);
  if (!current || current.controller !== controller) return false;
  const stream = typeof update === "function"
    ? (update as (value: T | null) => T | null)(current.stream)
    : update;
  activeGenerations.set(key, { ...current, stream });
  notifyConversation(key);
  return true;
}

export function finishLiveGeneration(key: string, controller: AbortController): boolean {
  const current = activeGenerations.get(key);
  if (!current || current.controller !== controller) return false;
  activeGenerations.delete(key);
  notifyConversation(key);
  refreshActiveProjectIds();
  return true;
}

export function abortLiveGeneration(key: string): boolean {
  const current = activeGenerations.get(key);
  if (!current) return false;
  current.controller.abort();
  return true;
}

function notifyConversation(key: string) {
  for (const listener of conversationListeners.get(key) ?? []) listener();
}

function refreshActiveProjectIds() {
  const next = [...new Set([...activeGenerations.values()].map(({ projectId }) => projectId))];
  if (next.length === activeProjectIdsSnapshot.length && next.every((id, index) => id === activeProjectIdsSnapshot[index])) return;
  activeProjectIdsSnapshot = next;
  for (const listener of activeListeners) listener();
}
