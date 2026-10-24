import { authHeaders } from "@/lib/api/client";
import { shouldExtractMemory } from "@/lib/memory/normalize";
import { containsSensitiveMemory, isWorkNoteRequest, memorySafeTurns } from "@/lib/memory/privacy";
import type { ChatTurn } from "@/types/chat";
import type { ChatMemoryContext } from "@/types/memory";

export function syncUserMemories(input: {
  userId: string;
  prompt: string;
  memories: ChatMemoryContext[];
  personalization?: string;
  history?: ChatTurn[];
  projectId?: string;
  projectMemory?: string[];
  onProjectMemory?: (lines: string[]) => void;
}): Promise<boolean> {
  if (!input.userId || !input.prompt.trim()) return Promise.resolve(false);
  if (containsSensitiveMemory(input.prompt) || isWorkNoteRequest(input.prompt)) return Promise.resolve(false);
  if (!shouldExtractMemory(input.prompt)) return Promise.resolve(false);
  return runMemorySync(input);
}

async function runMemorySync(input: {
  userId: string;
  prompt: string;
  memories: ChatMemoryContext[];
  personalization?: string;
  history?: ChatTurn[];
  projectId?: string;
  projectMemory?: string[];
  onProjectMemory?: (lines: string[]) => void;
}): Promise<boolean> {
  try {
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        prompt: input.prompt,
        history: memorySafeTurns(input.history ?? []),
      }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { saved?: boolean };
    if (data.saved && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tobyverse:memory-changed"));
    return data.saved === true;
  } catch {
    return false;
  }
}
