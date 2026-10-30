const STORAGE_KEY = "tv.projectActivityNotifications";
const EVENT_NAME = "tv:project-activity-notifications";

export function nextProjectActivityNotifications(ids: string[], projectId: string, activeProjectId: string | null): string[] {
  if (!projectId || projectId === activeProjectId || ids.includes(projectId)) return ids;
  return [...ids, projectId];
}

export function clearProjectActivityNotification(ids: string[], projectId: string): string[] {
  return ids.filter((id) => id !== projectId);
}

function readNotifications(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeNotifications(ids: string[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* private mode */
  }
}

function activeProjectId(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/(?:p|c)\/([^/]+)/);
  return match?.[1] ?? null;
}

export function getProjectActivityNotifications(): string[] {
  return readNotifications();
}

export function subscribeProjectActivityNotifications(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export function markProjectActivityComplete(projectId: string) {
  if (typeof window === "undefined" || !projectId) return;
  const current = readNotifications();
  const next = nextProjectActivityNotifications(current, projectId, activeProjectId());
  if (next.length !== current.length) writeNotifications(next);
}

export function markProjectGenerationComplete(projectId: string) {
  markProjectActivityComplete(projectId);
}

export function clearProjectActivityNotificationFor(projectId: string) {
  if (typeof window === "undefined" || !projectId) return;
  const current = readNotifications();
  const next = clearProjectActivityNotification(current, projectId);
  if (next.length !== current.length) writeNotifications(next);
}
