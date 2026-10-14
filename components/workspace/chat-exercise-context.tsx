"use client";

import { createContext, useContext, type ReactNode } from "react";
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
  return (
    <ChatExerciseContext.Provider value={{ priorPapers, interactive }}>{children}</ChatExerciseContext.Provider>
  );
}

export function useChatExercise(): ChatExerciseValue {
  return useContext(ChatExerciseContext);
}
