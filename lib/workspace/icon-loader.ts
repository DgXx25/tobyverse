export function createBatchedIconLoader<T>(
  fetchBatch: (names: string[]) => Promise<Record<string, T | null | undefined>>,
  batchSize = 80,
) {
  const cache = new Map<string, T>();
  const pending = new Map<string, Promise<T | null>>();
  const queue = new Map<string, (value: T | null) => void>();
  let scheduled = false;

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => void flush());
  }

  async function flush(): Promise<void> {
    scheduled = false;
    const batch = [...queue.entries()].slice(0, batchSize);
    batch.forEach(([name]) => queue.delete(name));
    if (batch.length === 0) return;

    let icons: Record<string, T | null | undefined> = {};
    try {
      icons = await fetchBatch(batch.map(([name]) => name));
    } catch {
      // Resolve failures so callers stop showing a loading state; a later request can retry.
    }

    for (const [name, resolve] of batch) {
      const icon = icons[name] ?? null;
      if (icon) cache.set(name, icon);
      pending.delete(name);
      resolve(icon);
    }
    if (queue.size > 0) schedule();
  }

  function load(name: string): Promise<T | null> {
    const cached = cache.get(name);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(name);
    if (inFlight) return inFlight;

    let resolve!: (value: T | null) => void;
    const request = new Promise<T | null>((done) => { resolve = done; });
    pending.set(name, request);
    queue.set(name, resolve);
    schedule();
    return request;
  }

  return { load };
}
