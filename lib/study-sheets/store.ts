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
import { COLLECTIONS } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { asString, toIsoDate } from "@/lib/timestamps";
import { mapNoteRecord } from "@/lib/notes/compat";
import { normalizeNoteBlocks } from "@/lib/notes/blocks";
import { NOTES_SCHEMA_VERSION } from "@/types/study-sheet";
import type { VisualBlock } from "@/types/visual";
import type { StudySheet } from "@/types/study-sheet";

function sheetsRef(projectId: string) {
  return collection(
    getFirebaseDb(),
    COLLECTIONS.projects,
    projectId,
    COLLECTIONS.studySheets,
  );
}

function mapSheet(id: string, projectId: string, data: Record<string, unknown>): StudySheet {
  return mapNoteRecord(id, projectId, data, {
    userId: asString(data.userId),
    title: asString(data.title, "Notes"),
    sourceMaterialIds: Array.isArray(data.sourceMaterialIds)
      ? data.sourceMaterialIds.filter((item): item is string => typeof item === "string")
      : [],
    createdAt: toIsoDate(data.createdAt),
  });
}

export async function createStudySheet(input: {
  projectId: string;
  userId: string;
  title: string;
  blocks: VisualBlock[];
  sourceMaterialIds: string[];
  content?: string;
}): Promise<string> {
  const ref = await addDoc(sheetsRef(input.projectId), {
    projectId: input.projectId,
    userId: input.userId,
    title: input.title.trim() || "Notes",
    schemaVersion: NOTES_SCHEMA_VERSION,
    blocks: normalizeNoteBlocks(input.blocks, input.content ?? ""),
    content: input.content ?? "",
    sourceMaterialIds: input.sourceMaterialIds,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeStudySheets(
  projectId: string,
  onChange: (items: StudySheet[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    sheetsRef(projectId),
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => mapSheet(item.id, projectId, item.data()))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      onChange(items);
    },
    (error) => onError?.(error),
  );
}

export async function listStudySheets(projectId: string): Promise<StudySheet[]> {
  const snapshot = await getDocs(sheetsRef(projectId));
  return snapshot.docs.map((item) => mapSheet(item.id, projectId, item.data()));
}

export async function getStudySheet(projectId: string, sheetId: string): Promise<StudySheet | null> {
  const snapshot = await getDoc(doc(sheetsRef(projectId), sheetId));
  if (!snapshot.exists()) return null;
  return mapSheet(snapshot.id, projectId, snapshot.data());
}

export async function updateStudySheet(
  projectId: string,
  sheetId: string,
  patch: Partial<Pick<StudySheet, "title" | "blocks" | "content" | "sourceMaterialIds" | "schemaVersion">>,
): Promise<void> {
  const payload: Record<string, unknown> = { ...patch };
  if (patch.blocks) {
    payload.blocks = normalizeNoteBlocks(patch.blocks, patch.content ?? "");
    payload.schemaVersion = NOTES_SCHEMA_VERSION;
  }
  await updateDoc(doc(sheetsRef(projectId), sheetId), payload);
}

export async function deleteStudySheet(projectId: string, sheetId: string): Promise<void> {
  await deleteDoc(doc(sheetsRef(projectId), sheetId));
}
