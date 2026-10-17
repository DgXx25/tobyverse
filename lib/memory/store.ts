import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { FREE_CAPS } from "@/lib/account/plan";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { sanitizeMemoryContent, memoryKey } from "@/lib/memory/normalize";
import { asString, toIsoDate } from "@/lib/timestamps";
import type { MemoryOp, UserMemory } from "@/types/memory";

function memoriesRef(userId: string) {
  return collection(getFirebaseDb(), COLLECTIONS.users, userId, COLLECTIONS.memories);
}

function memoryDoc(userId: string, memoryId: string) {
  return doc(getFirebaseDb(), COLLECTIONS.users, userId, COLLECTIONS.memories, memoryId);
}

function mapMemory(id: string, data: Record<string, unknown>): UserMemory | null {
  const content = sanitizeMemoryContent(data.content);
  if (!content) return null;
  return {
    id: asString(data.id, id) || id,
    content,
    createdAt: toIsoDate(data.createdAt),
    updatedAt: toIsoDate(data.updatedAt),
  };
}

function sortMemories(items: UserMemory[]): UserMemory[] {
  return [...items].sort((a, b) => {
    const left = a.updatedAt || a.createdAt || "";
    const right = b.updatedAt || b.createdAt || "";
    return right.localeCompare(left);
  });
}

export async function listMemories(userId: string, cached = false): Promise<UserMemory[]> {
  if (!userId) return [];
  const snapshot = await (cached ? getDocsFromCache(memoriesRef(userId)) : getDocs(memoriesRef(userId)));
  const items = snapshot.docs.flatMap((item) => {
    const mapped = mapMemory(item.id, item.data());
    return mapped ? [mapped] : [];
  });
  return sortMemories(items).slice(0, FREE_CAPS.memories);
}

export function subscribeMemories(
  userId: string,
  onChange: (items: UserMemory[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    memoriesRef(userId),
    (snapshot) => {
      const items = snapshot.docs.flatMap((item) => {
        const mapped = mapMemory(item.id, item.data());
        return mapped ? [mapped] : [];
      });
      onChange(sortMemories(items).slice(0, FREE_CAPS.memories));
    },
    (error) => onError?.(error),
  );
}

export async function addMemory(userId: string, raw: string): Promise<UserMemory | null> {
  const content = sanitizeMemoryContent(raw);
  if (!userId || !content) return null;
  const ref = doc(memoriesRef(userId));
  await setDoc(
    ref,
    omitUndefined({
      id: ref.id,
      content,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  return {
    id: ref.id,
    content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateMemory(userId: string, memoryId: string, raw: string): Promise<void> {
  const content = sanitizeMemoryContent(raw);
  if (!userId || !memoryId || !content) return;
  await updateDoc(memoryDoc(userId, memoryId), {
    content,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  if (!userId || !memoryId) return;
  await deleteDoc(memoryDoc(userId, memoryId));
}

export async function deleteAllMemories(userId: string): Promise<void> {
  if (!userId) return;
  const snapshot = await getDocs(memoriesRef(userId));
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(getFirebaseDb());
    for (const item of docs.slice(i, i + 400)) {
      batch.delete(item.ref);
    }
    await batch.commit();
  }
}

function oldestMemory(items: UserMemory[]): UserMemory | null {
  if (items.length === 0) return null;
  return items.reduce((oldest, item) => {
    const left = oldest.createdAt || oldest.updatedAt || "";
    const right = item.createdAt || item.updatedAt || "";
    return right < left ? item : oldest;
  });
}

export async function applyMemoryOperations(userId: string, ops: MemoryOp[]): Promise<boolean> {
  if (!userId || ops.length === 0) return false;
  let items = await listMemories(userId);
  const byId = () => new Map(items.map((item) => [item.id, item]));
  let saved = false;

  for (const op of ops) {
    if (op.op === "delete") {
      if (!byId().has(op.id)) continue;
      await deleteMemory(userId, op.id);
      items = items.filter((item) => item.id !== op.id);
    }
  }

  for (const op of ops) {
    if (op.op !== "update") continue;
    const current = byId().get(op.id);
    const content = sanitizeMemoryContent(op.content);
    if (!current || !content || memoryKey(content) === memoryKey(current.content)) continue;
    if (items.some((item) => item.id !== op.id && memoryKey(item.content) === memoryKey(content))) {
      await deleteMemory(userId, op.id);
      items = items.filter((item) => item.id !== op.id);
      continue;
    }
    await updateMemory(userId, op.id, content);
    items = items.map((item) => (item.id === op.id ? { ...item, content } : item));
    saved = true;
  }

  for (const op of ops) {
    if (op.op !== "add") continue;
    const content = sanitizeMemoryContent(op.content);
    if (!content) continue;
    if (items.some((item) => memoryKey(item.content) === memoryKey(content))) continue;
    while (items.length >= FREE_CAPS.memories) {
      const drop = oldestMemory(items);
      if (!drop) break;
      await deleteMemory(userId, drop.id);
      items = items.filter((item) => item.id !== drop.id);
    }
    const created = await addMemory(userId, content);
    if (created) {
      items = [created, ...items].slice(0, FREE_CAPS.memories);
      saved = true;
    }
  }

  return saved;
}
