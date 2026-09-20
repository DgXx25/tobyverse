import { stripArtifactMarkup } from "@/lib/composer/memory";

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
  _opts?: { minChars?: number; ms?: number },
) {
  let full = "";
  let frame = 0;

  function visible() {
    return stripArtifactMarkup(full);
  }

  function flush() {
    frame = 0;
    onUpdate(visible());
  }

  return {
    push(delta: string) {
      full = mergeStreamDelta(full, delta);
      if (!frame) frame = requestAnimationFrame(flush);
    },
    finish() {
      if (frame) cancelAnimationFrame(frame);
      flush();
      return visible();
    },
    get text() {
      return visible();
    },
    get raw() {
      return full;
    },
  };
}
