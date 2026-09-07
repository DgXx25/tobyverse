import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { asString, toIsoDate } from "@/lib/timestamps";
import { isProblemType, isTheoryType } from "@/lib/exercises/templates";
import { EXERCISE_SCHEMA_VERSION } from "@/types/exercise";
import type { ExerciseCategory, ExercisePayloadMap, ExerciseType } from "@/types/exercise";

export type ProjectExercise = {
  id: string;
  projectId: string;
  userId: string;
  type: ExerciseType | "unsupported";
  rawType?: string;
  category: ExerciseCategory;
  schemaVersion: number;
  data: ExercisePayloadMap[ExerciseType] | Record<string, unknown>;
  sourceMaterialIds: string[];
  knowledgeItemId: string | null;
  createdAt: string | null;
};

function exercisesRef(projectId: string) {
  return collection(getFirebaseDb(), COLLECTIONS.projects, projectId, COLLECTIONS.exercises);
}

function asType(value: unknown): ExerciseType | null {
  if (typeof value !== "string") return null;
  if (isTheoryType(value) || isProblemType(value)) return value;
  return null;
}

function schemaVersionOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : EXERCISE_SCHEMA_VERSION;
}

function mapExercise(id: string, projectId: string, data: Record<string, unknown>): ProjectExercise {
  const type = asType(data.type);
  const sourceMaterialIds = Array.isArray(data.sourceMaterialIds)
    ? data.sourceMaterialIds.filter((item): item is string => typeof item === "string")
    : [];
  const knowledgeItemId = typeof data.knowledgeItemId === "string" ? data.knowledgeItemId : null;
  const payload = (data.data ?? data.payload ?? {}) as ExercisePayloadMap[ExerciseType] | Record<string, unknown>;

  if (!type) {
    return {
      id,
      projectId,
      userId: asString(data.userId),
      type: "unsupported",
      rawType: typeof data.type === "string" ? data.type : undefined,
      category: data.category === "problems" ? "problems" : "theory",
      schemaVersion: schemaVersionOf(data.schemaVersion),
      data: payload,
      sourceMaterialIds,
      knowledgeItemId,
      createdAt: toIsoDate(data.createdAt),
    };
  }

  const category: ExerciseCategory = data.category === "problems" || isProblemType(type) ? "problems" : "theory";
  return {
    id,
    projectId,
    userId: asString(data.userId),
    type,
    category,
    schemaVersion: schemaVersionOf(data.schemaVersion),
    data: payload,
    sourceMaterialIds,
    knowledgeItemId,
    createdAt: toIsoDate(data.createdAt),
  };
}

export async function createExercise(
  input: Omit<ProjectExercise, "id" | "createdAt" | "schemaVersion" | "rawType" | "type"> & {
    type: ExerciseType;
  },
): Promise<string> {
  const ref = await addDoc(
    exercisesRef(input.projectId),
    omitUndefined({
      projectId: input.projectId,
      userId: input.userId,
      type: input.type,
      category: input.category,
      schemaVersion: EXERCISE_SCHEMA_VERSION,
      data: input.data,
      sourceMaterialIds: input.sourceMaterialIds,
      knowledgeItemId: input.knowledgeItemId,
      createdAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

export function subscribeExercises(
  projectId: string,
  onChange: (items: ProjectExercise[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    exercisesRef(projectId),
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => mapExercise(item.id, projectId, item.data()))
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
      onChange(items);
    },
    (error) => onError?.(error),
  );
}

export async function listExercises(projectId: string): Promise<ProjectExercise[]> {
  const snapshot = await getDocs(exercisesRef(projectId));
  return snapshot.docs.map((item) => mapExercise(item.id, projectId, item.data()));
}

export async function getExercise(projectId: string, exerciseId: string): Promise<ProjectExercise | null> {
  const snapshot = await getDoc(doc(exercisesRef(projectId), exerciseId));
  if (!snapshot.exists()) return null;
  return mapExercise(snapshot.id, projectId, snapshot.data());
}

export async function updateExercise(
  projectId: string,
  exerciseId: string,
  patch: Partial<Pick<ProjectExercise, "type" | "category" | "data" | "sourceMaterialIds" | "knowledgeItemId">>,
): Promise<void> {
  await updateDoc(doc(exercisesRef(projectId), exerciseId), patch);
}

export async function deleteExercise(projectId: string, exerciseId: string): Promise<void> {
  await deleteDoc(doc(exercisesRef(projectId), exerciseId));
}

export function exerciseStem(item: ProjectExercise): string {
  const data = item.data as Record<string, unknown>;
  const stem = [data.question, data.statement, data.prompt, data.problem, data.scenario]
    .find((value) => typeof value === "string") as string | undefined;
  return (stem ?? item.type).slice(0, 80);
}
