import { clipText } from "@/lib/materials/limits";
import { listChatMessages } from "@/lib/chats";

export async function chatContextExcerpt(
  projectId: string,
  maxChars: number,
): Promise<{ title: string; excerpt: string } | null> {
  const messages = await listChatMessages(projectId);
  const text = messages
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-8)
    .map((item) => `${item.role === "user" ? "Student" : "Tutor"}: ${item.content}`)
    .join("\n\n")
    .trim();
  const excerpt = clipText(text, maxChars);
  if (!excerpt) return null;
  return { title: "Recent chat", excerpt };
}
