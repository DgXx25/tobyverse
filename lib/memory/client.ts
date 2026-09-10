import { authHeaders } from "@/lib/api/client";
import { applyMemoryOperations } from "@/lib/memory/store";
import { parseMemoryOps, parsePersonalizationPatch } from "@/lib/memory/normalize";
import { setLearningProfile } from "@/lib/memory/profile";
import type { ChatMemoryContext } from "@/types/memory";
import type { ChatTurn } from "@/types/chat";

export function syncUserMemories(input: {
  userId: string;
  prompt: string;
  memories: ChatMemoryContext[];
  personalization?: string;
  history?: ChatTurn[];
}): Promise<boolean> {
  if (!input.userId || !input.prompt.trim()) return Promise.resolve(false);
  return runMemorySync(input);
}

async function runMemorySync(input: {
  userId: string;
  prompt: string;
  memories: ChatMemoryContext[];
  personalization?: string;
  history?: ChatTurn[];
}): Promise<boolean> {
  try {
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        prompt: input.prompt,
        memories: input.memories,
        personalization: input.personalization ?? "",
        history: input.history,
      }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { operations?: unknown; personalization?: unknown };
    const known = new Set(input.memories.map((item) => item.id));
    const ops = parseMemoryOps(data, known);
    const nextProfile = parsePersonalizationPatch(data, input.personalization ?? "");
    if (nextProfile) {
      await setLearningProfile(input.userId, nextProfile).catch(() => undefined);
    }
    if (ops.length === 0) return false;
    return await applyMemoryOperations(input.userId, ops);
  } catch {
    return false;
  }
}
