import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";
import type { Project } from "@/types/project";

export function fastMainChatRoute(
  chatId: string,
  userId: string,
  project: Pick<Project, "id" | "userId"> | null,
) {
  if (!project || project.id !== chatId || project.userId !== userId) return null;
  return {
    projectId: chatId,
    threadId: DEFAULT_CHAT_THREAD_ID,
    project,
  };
}
