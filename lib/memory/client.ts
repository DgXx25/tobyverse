import { authHeaders } from "@/lib/api/client";
import { applyMemoryOperations } from "@/lib/memory/store";
import { foldLearningSignal, isStudyMethodMemory, parseMemoryOps, parsePersonalizationPatch, shouldExtractMemory } from "@/lib/memory/normalize";
import { setLearningProfile } from "@/lib/memory/profile";
import type { ChatTurn } from "@/types/chat";
import type { ChatMemoryContext, MemoryOp } from "@/types/memory";

export function syncUserMemories(input: {
  userId: string;
  prompt: string;
  memories: ChatMemoryContext[];
  personalization?: string;
  history?: ChatTurn[];
}): Promise<boolean> {
  if (!input.userId || !input.prompt.trim()) return Promise.resolve(false);
  if (!shouldExtractMemory(input.prompt)) {
    return migrateStudyMethodMemories(input).then(() => false);
  }
  return runMemorySync(input);
}

async function migrateStudyMethodMemories(input: {
  userId: string;
  memories: ChatMemoryContext[];
  personalization?: string;
}): Promise<void> {
  const current = input.personalization ?? "";
  let nextProfile = current;
  const drop: string[] = [];
  for (const mem of input.memories) {
    if (!isStudyMethodMemory(mem.content)) continue;
    nextProfile = foldLearningSignal(nextProfile, mem.content);
    drop.push(mem.id);
  }
  try {
    if (nextProfile.trim() && nextProfile !== current.trim()) {
      await setLearningProfile(input.userId, nextProfile);
    }
    if (drop.length > 0) {
      await applyMemoryOperations(
        input.userId,
        drop.map((id) => ({ op: "delete" as const, id })),
      );
    }
  } catch {
    return;
  }
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
    const current = input.personalization ?? "";
    const extractProfile = parsePersonalizationPatch(data, current);
    let nextProfile = extractProfile;
    const drop = new Set<string>();
    for (const mem of input.memories) {
      if (!isStudyMethodMemory(mem.content)) continue;
      nextProfile = foldLearningSignal(nextProfile ?? current, mem.content);
      drop.add(mem.id);
    }
    const kept: MemoryOp[] = [];
    for (const op of ops) {
      if ((op.op === "add" || op.op === "update") && isStudyMethodMemory(op.content)) {
        nextProfile = foldLearningSignal(nextProfile ?? current, op.content);
        if (op.op === "update") drop.add(op.id);
        continue;
      }
      if (op.op === "delete") {
        drop.add(op.id);
        continue;
      }
      if (op.op === "update" && drop.has(op.id)) continue;
      kept.push(op);
    }
    for (const id of drop) kept.push({ op: "delete", id });
    if (nextProfile && nextProfile !== current.trim()) {
      await setLearningProfile(input.userId, nextProfile);
    }
    if (kept.length > 0) await applyMemoryOperations(input.userId, kept);
    const userFacingOps = kept.some((op) => op.op === "add" || op.op === "update");
    return Boolean(extractProfile) || userFacingOps;
  } catch {
    return false;
  }
}
