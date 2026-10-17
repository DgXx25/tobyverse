"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createChatBlockStateStore } from "@/lib/workspace/chat-block-state";

type Store = ReturnType<typeof createChatBlockStateStore>;
const StateContext = createContext<{ store: Store; scope: string } | null>(null);

export function ChatBlockStateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createChatBlockStateStore);
  const value = useMemo(() => ({ store, scope: "" }), [store]);
  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function ChatBlockStateScope({ scope, children }: { scope: string; children: ReactNode }) {
  const parent = useContext(StateContext);
  const value = useMemo(() => parent ? { store: parent.store, scope: `${parent.scope}/${scope}` } : null, [parent, scope]);
  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

/** Falls back to ordinary local state outside a virtual chat. */
export function useChatBlockState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(StateContext);
  const [fallback] = useState(initial);
  const [local, setLocal] = useState<T>(() => fallback);
  const id = `${context?.scope}/${key}`;
  const store = context?.store;
  const subscribe = useCallback((notify: () => void) => store ? store.subscribe(id, notify) : () => {}, [store, id]);
  const snapshot = useCallback(() => store ? store.read(id, fallback) : local, [store, id, fallback, local]);
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    if (!store) { setLocal(next); return; }
    const previous = store.read(id, fallback);
    store.write(id, typeof next === "function" ? (next as (previous: T) => T)(previous) : next);
  }, [store, id, fallback]);
  return [value, setValue];
}
