"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PaperPayload } from "@/types/exercise";
import type { ChatImageHit } from "@/types/chat";

type ChatExerciseValue = {
  priorPapers: PaperPayload[];
  interactive: boolean;
  onReply?: (text: string) => void | Promise<void>;
  images?: ChatImageHit[];
};

const ChatExerciseContext = createContext<ChatExerciseValue>({
  priorPapers: [],
  interactive: true,
});

export function ChatExerciseProvider({
  priorPapers,
  interactive,
  onReply,
  images,
  children,
}: ChatExerciseValue & { children: ReactNode }) {
  const value = useMemo(() => ({ priorPapers, interactive, onReply, images }), [priorPapers, interactive, onReply, images]);
  return <ChatExerciseContext.Provider value={value}>{children}</ChatExerciseContext.Provider>;
}

export function useChatExercise(): ChatExerciseValue {
  return useContext(ChatExerciseContext);
}
