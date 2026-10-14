import { authHeaders } from "@/lib/api/client";
import { updateChatTitle } from "@/lib/chats";
import { updateProjectTitle } from "@/lib/projects";
import { fallbackChatTitle, isRealUserPrompt, needsAutoTitle, sanitizeChatTitle } from "@/lib/workspace/title";
import { DEFAULT_CHAT_THREAD_ID } from "@/lib/core/constants";

export async function autoNameChat(input: {
  projectId: string;
  threadId: string;
  userId: string;
  prompt: string;
  currentTitle: string;
  listedProject?: boolean;
}): Promise<string | null> {
  if (!needsAutoTitle(input.currentTitle)) return null;
  if (!isRealUserPrompt(input.prompt)) return null;

  const fallback = fallbackChatTitle(input.prompt);
  let title = fallback;

  try {
    const response = await fetch("/api/projects/title", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ prompt: input.prompt.slice(0, 800) }),
    });
    const data = (await response.json()) as { title?: string };
    const next = typeof data.title === "string" ? sanitizeChatTitle(data.title) : null;
    if (next) title = next;
  } catch {
    // Local truncate+clean is enough if Gemini is unavailable.
  }

  await updateChatTitle(input.projectId, input.threadId, title);
  if (!input.listedProject) {
    await updateProjectTitle(input.projectId, input.userId, title);
  }
  return title;
}

/** @deprecated use autoNameChat — kept for any leftover callers */
export async function autoNameProject(input: {
  projectId: string;
  userId: string;
  prompt: string;
  currentTitle: string;
}): Promise<string | null> {
  return autoNameChat({
    ...input,
    threadId: DEFAULT_CHAT_THREAD_ID,
  });
}
