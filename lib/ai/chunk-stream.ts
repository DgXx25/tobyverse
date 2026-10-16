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

type Scheduler = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
};

const browserScheduler: Scheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

/** Characters per millisecond. Grows with the backlog so we never fall far behind the model. */
export function revealRate(backlog: number): number {
  return Math.max(0.09, backlog / 170);
}

/** Never cut inside a word. Looks a few characters ahead for a space or line break. */
export function snapToWord(text: string, index: number, lookahead = 14): number {
  if (index >= text.length) return text.length;
  for (let i = index; i < Math.min(text.length, index + lookahead); i += 1) {
    const char = text[i];
    if (char === " " || char === "\n") return i + 1;
  }
  // The rest is one unfinished word at the end of what has arrived: show it whole.
  if (text.length - index < lookahead) return text.length;
  // No boundary close by (a URL, a long Georgian compound): do not split a surrogate pair.
  const code = text.charCodeAt(index - 1);
  return code >= 0xd800 && code <= 0xdbff ? index + 1 : index;
}

/**
 * Paced reveal. Network chunks arrive in bursts, so rendering them directly makes text pop in.
 * This keeps a target string and eases the visible part toward it every frame.
 */
export function createChunkBuffer(
  onUpdate: (text: string) => void,
  options?: { scheduler?: Scheduler; deltaMode?: "append" },
) {
  const scheduler = options?.scheduler ?? browserScheduler;
  let full = "";
  let shown = 0;
  let frame = 0;
  let last = 0;
  let waiters: (() => void)[] = [];
  let emitted = "";

  function target() {
    return stripArtifactMarkup(full);
  }

  function emit(text: string) {
    if (text === emitted) return;
    emitted = text;
    onUpdate(text);
  }

  function settle() {
    const pending = waiters;
    waiters = [];
    for (const resolve of pending) resolve();
  }

  function tick() {
    frame = 0;
    const text = target();
    // Markup stripping can shorten the target; never reveal past it.
    if (shown > text.length) shown = text.length;
    const time = scheduler.now();
    const dt = last ? Math.min(64, Math.max(1, time - last)) : 16;
    last = time;
    const backlog = text.length - shown;
    if (backlog > 0) {
      const step = Math.max(1, Math.round(revealRate(backlog) * dt));
      shown = snapToWord(text, Math.min(text.length, shown + step));
      emit(text.slice(0, shown));
    }
    if (shown < text.length) {
      frame = scheduler.request(tick);
    } else {
      last = 0;
      settle();
    }
  }

  function ensureRunning() {
    if (!frame) frame = scheduler.request(tick);
  }

  return {
    push(delta: string) {
      // SSE delta events are incremental: repeated pipes/newlines are meaningful Markdown.
      full = options?.deltaMode === "append" ? full + delta : mergeStreamDelta(full, delta);
      ensureRunning();
    },
    /** Resolves once the visible text has caught up with what has been received (bounded). */
    drain(maxMs = 800): Promise<void> {
      if (shown >= target().length) return Promise.resolve();
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiters = waiters.filter((item) => item !== done);
          resolve();
        }, maxMs);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        waiters.push(done);
        ensureRunning();
      });
    },
    /** Shows everything immediately and returns the final text. */
    finish() {
      if (frame) scheduler.cancel(frame);
      frame = 0;
      const text = target();
      shown = text.length;
      emit(text);
      settle();
      return text;
    },
    get text() {
      return target();
    },
    get raw() {
      return full;
    },
  };
}
