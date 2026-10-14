import type { ChatMessage } from "@/types/chat";
import type { Material } from "@/types/material";
import type { StudySheet } from "@/types/study-sheet";

export type SharedChatSnapshot = {
  chatId: string;
  shareId: string;
  project: {
    id: string;
    title: string;
  };
  thread: {
    id: string;
    title: string;
  };
  messages: ChatMessage[];
  materials: Material[];
  sheets: StudySheet[];
};
