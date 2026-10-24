import { syncUserMemories } from "@/lib/memory/client";
import { containsSensitiveMemory, isWorkNoteRequest } from "@/lib/memory/privacy";

/** Capture only durable personal facts; chat history and materials already carry project context. */
export function createMemorySession(input: Parameters<typeof syncUserMemories>[0] & { threadId: string; skip?: boolean }) {
  const skip = input.skip || containsSensitiveMemory(input.prompt) || isWorkNoteRequest(input.prompt);
  const updates = skip ? Promise.resolve(false) : syncUserMemories(input);
  return {
    updates,
    // Compatibility with existing chat callers; no project observer or secondary model call.
    observe(turn: { turnId: string; answer: string }) { void turn; },
  };
}
