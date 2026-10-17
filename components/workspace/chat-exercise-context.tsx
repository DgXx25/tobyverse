"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PaperPayload } from "@/types/exercise";

type ChatExerciseValue = {
  priorPapers: PaperPayload[];
  interactive: boolean;
};

const ChatExerciseContext = createContext<ChatExerciseValue>({
  priorPapers: [],
  interactive: true,
});

export function ChatExerciseProvider({
  priorPapers,
  interactive,
  children,
}: ChatExerciseValue & { children: ReactNode }) {
  const value = useMemo(() => ({ priorPapers, interactive }), [priorPapers, interactive]);
  return <ChatExerciseContext.Provider value={value}>{children}</ChatExerciseContext.Provider>;
}

export function useChatExercise(): ChatExerciseValue {
  return useContext(ChatExerciseContext);
}
