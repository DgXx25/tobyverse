import { syncUserMemories } from "@/lib/memory/client";
import { cachedLearningProfile } from "@/lib/memory/profile";
import { observeConversation } from "@/lib/adaptation/client";
import { containsSensitiveMemory, isWorkNoteRequest } from "@/lib/memory/privacy";

/** One memory lifecycle: direct instructions update promptly; ordinary behavior updates in bounded batches. */
export function createMemorySession(input: Parameters<typeof syncUserMemories>[0] & { threadId: string; skip?: boolean }) {
  const skip = input.skip || containsSensitiveMemory(input.prompt) || isWorkNoteRequest(input.prompt);
  const updates = skip ? Promise.resolve(false) : syncUserMemories(input);
  return {
    updates,
    observe(turn: { turnId: string; answer: string }) {
      if (skip || !input.projectId) return;
      const projectId = input.projectId;
      // Keep this off the response path and let newly shared preferences inform the observer too.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const ready = Promise.race([
        updates.catch(() => false),
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 1500); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      void ready.then(() => observeConversation({
        userId: input.userId, projectId, threadId: input.threadId, prompt: input.prompt,
        history: input.history ?? [], memories: input.memories,
        personalization: typeof window === "undefined" ? input.personalization : cachedLearningProfile(input.userId, input.personalization),
        ...turn,
      })).catch(() => undefined);
    },
  };
}
