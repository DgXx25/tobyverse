import { addDoc, collection, getDocs, limit, query } from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { clipPrompt } from "@/lib/admin/playground";
import type {
  EvalRun,
  EvalSnapshot,
  PlaygroundAudit,
  PlaygroundSnapshot,
  PlaygroundVersionId,
} from "@/types/admin";

const PROMPT_CLIP = 240;

export async function savePlaygroundSnapshot(input: {
  userId: string;
  prompts: Record<PlaygroundVersionId, string>;
  audit: PlaygroundAudit;
}): Promise<string> {
  const payload: Omit<PlaygroundSnapshot, "id"> = {
    userId: input.userId,
    prompts: {
      1: clipPrompt(input.prompts[1], PROMPT_CLIP),
      2: clipPrompt(input.prompts[2], PROMPT_CLIP),
      3: clipPrompt(input.prompts[3], PROMPT_CLIP),
    },
    scores: {
      1: input.audit.versions[1].scores,
      2: input.audit.versions[2].scores,
      3: input.audit.versions[3].scores,
    },
    winner: input.audit.winner,
    auditSummary: clipPrompt(input.audit.reason, 180),
    createdAt: new Date().toISOString(),
  };

  const ref = await addDoc(collection(getFirebaseDb(), COLLECTIONS.playgroundSnapshots), payload);
  return ref.id;
}

export async function listPlaygroundSnapshots(max = 20): Promise<PlaygroundSnapshot[]> {
  const snapshot = await getDocs(
    query(collection(getFirebaseDb(), COLLECTIONS.playgroundSnapshots), limit(max)),
  );

  return snapshot.docs
    .map((item) => {
      const data = item.data() as Omit<PlaygroundSnapshot, "id">;
      return { ...data, id: item.id };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveEvalSnapshot(input: { userId: string; run: EvalRun }): Promise<string> {
  const payload: Omit<EvalSnapshot, "id"> = {
    userId: input.userId,
    suiteId: input.run.suiteId,
    variant: clipPrompt(input.run.variant, 80),
    passed: input.run.passed,
    failed: input.run.failed,
    cases: input.run.cases.map((row) => ({
      id: row.id,
      expected: clipPrompt(row.expected, 80),
      actual: clipPrompt(row.actual, 80),
      pass: row.pass,
      note: clipPrompt(row.note, 120),
    })),
    createdAt: new Date().toISOString(),
  };

  const ref = await addDoc(collection(getFirebaseDb(), COLLECTIONS.evalSnapshots), payload);
  return ref.id;
}
