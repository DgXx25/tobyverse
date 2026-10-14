import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";

export function chatPath(chatId: string): string {
  return `/c/${chatId}`;
}

export function projectHomePath(projectId: string): string {
  return `/p/${projectId}`;
}

/** URL id for a thread. The first/legacy `main` thread is addressed as the project id. */
export function publicChatId(projectId: string, threadId?: string | null): string {
  if (!threadId || threadId === DEFAULT_CHAT_THREAD_ID) return projectId;
  return threadId;
}

export function nestedThreadId(projectId: string, chatId: string): string {
  return chatId === projectId ? DEFAULT_CHAT_THREAD_ID : chatId;
}

export function isListedProject(project: { listed?: boolean }): boolean {
  return project.listed === true;
}
