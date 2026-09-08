/** Incremental or cumulative provider chunks → a single growing string. */
export function mergeStreamDelta(full: string, delta: string): string {
  if (!delta) return full;
  if (!full) return delta;
  if (delta.startsWith(full)) return delta;
  if (full.endsWith(delta)) return full;
  const max = Math.min(full.length, delta.length, 256);
  for (let n = max; n > 0; n -= 1) {
    if (full.endsWith(delta.slice(0, n))) return full + delta.slice(n);
  }
  return full + delta;
}

export function createChunkBuffer(
  onUpdate: (text: string) => void,
  opts?: { minChars?: number; ms?: number },
) {
  const minChars = opts?.minChars ?? 18;
  const ms = opts?.ms ?? 36;
  let full = "";
  let sinceFlush = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    sinceFlush = 0;
    onUpdate(full);
  }

  return {
    push(delta: string) {
      const next = mergeStreamDelta(full, delta);
      sinceFlush += Math.max(0, next.length - full.length);
      full = next;
      if (sinceFlush >= minChars || /\n/.test(delta)) {
        flush();
        return;
      }
      if (!timer) timer = setTimeout(flush, ms);
    },
    finish() {
      flush();
      return full;
    },
    get text() {
      return full;
    },
  };
}
