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
      full += delta;
      sinceFlush += delta.length;
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
