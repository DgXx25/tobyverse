const pendingUploads = new Map<string, Set<Promise<unknown>>>();

export function trackSourceUpload<T>(projectId: string, work: Promise<T>): Promise<T> {
  let pending = pendingUploads.get(projectId);
  if (!pending) {
    pending = new Set();
    pendingUploads.set(projectId, pending);
  }
  pending.add(work);
  void work.finally(() => {
    pending.delete(work);
    if (pending.size === 0) pendingUploads.delete(projectId);
  }).catch(() => undefined);
  return work;
}

export function hasSourceUploads(projectId: string): boolean {
  return Boolean(pendingUploads.get(projectId)?.size);
}

export async function waitForSourceUploads(projectId: string): Promise<void> {
  while (hasSourceUploads(projectId)) {
    await Promise.allSettled([...pendingUploads.get(projectId)!]);
  }
}
