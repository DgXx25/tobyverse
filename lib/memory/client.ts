import { authHeaders } from "@/lib/api/client";
import { applyMemoryOperations } from "@/lib/memory/store";
import { parseMemoryOps } from "@/lib/memory/normalize";
import type { ChatMemoryContext } from "@/types/memory";
import type { ChatTurn } from "@/types/chat";

export function syncUserMemories(input: {
  userId: string;
  prompt: string;
  memories: ChatMemoryContext[];
  history?: ChatTurn[];
}): void {
  if (!input.userId || !input.prompt.trim()) return;
  void runMemorySync(input);
}

async function runMemorySync(input: {
  userId: string;
  prompt: string;
  memories: ChatMemoryContext[];
  history?: ChatTurn[];
}): Promise<void> {
  try {
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        prompt: input.prompt,
        memories: input.memories,
        history: input.history,
      }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { operations?: unknown };
    const known = new Set(input.memories.map((item) => item.id));
    const ops = parseMemoryOps(data, known);
    if (ops.length === 0) return;
    await applyMemoryOperations(input.userId, ops);
  } catch {
    // Memory must never block chat.
  }
}
