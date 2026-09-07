import { addDoc, collection } from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import type { TrainingContextType, TrainingSignalKind } from "@/types/training";

export function shortHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 10);
}

export async function recordTrainingSignal(input: {
  userId: string;
  projectId?: string | null;
  contextType: TrainingContextType;
  signal: TrainingSignalKind;
  itemId?: string | null;
  seed?: string;
}): Promise<void> {
  if (!isFirebaseConfigured()) return;

  await addDoc(collection(getFirebaseDb(), COLLECTIONS.trainingSignals), {
    userId: input.userId,
    projectId: input.projectId ?? null,
    contextType: input.contextType,
    signal: input.signal,
    shortHash: shortHash(input.seed ?? input.itemId ?? `${input.contextType}:${Date.now()}`),
    itemId: input.itemId ?? null,
    createdAt: new Date().toISOString(),
  });
}
