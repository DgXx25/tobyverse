/** Firestore can retry indefinitely when the browser loses its connection. */
export async function waitForChatStep<T>(
  step: string,
  run: () => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const { signal, timeoutMs = 12_000 } = options;
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => { signal?.throwIfAborted(); return run(); }),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
          const error = new Error(`${step} took too long. Check your connection and try again.`);
          error.name = 'ChatTimeoutError';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}
