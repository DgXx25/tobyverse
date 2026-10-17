/** Small interaction values survive row unmounts; no rendered trees or parsed content is retained. */
export function createChatBlockStateStore() {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    read<T>(key: string, fallback: T): T {
      return values.has(key) ? values.get(key) as T : fallback;
    },
    write<T>(key: string, value: T) {
      if (values.has(key) && Object.is(values.get(key), value)) return;
      values.set(key, value);
      listeners.get(key)?.forEach((notify) => notify());
    },
    subscribe(key: string, notify: () => void) {
      const subscribers = listeners.get(key) ?? new Set();
      subscribers.add(notify);
      listeners.set(key, subscribers);
      return () => {
        subscribers.delete(notify);
        if (!subscribers.size) listeners.delete(key);
      };
    },
  };
}
