function key(projectId: string) {
  return `tv.practice.progress.${projectId}`;
}

export function loadPracticeProgress(projectId: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        next[id] = Math.floor(value);
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function savePracticeIndex(projectId: string, setId: string, index: number): void {
  if (typeof window === "undefined") return;
  const all = loadPracticeProgress(projectId);
  all[setId] = Math.max(0, Math.floor(index));
  window.localStorage.setItem(key(projectId), JSON.stringify(all));
}
