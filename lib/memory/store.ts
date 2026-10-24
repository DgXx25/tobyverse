import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { sanitizeMemoryContent, memoryKey } from "@/lib/memory/normalize";
import { asString, toIsoDate } from "@/lib/timestamps";
import type { MemoryOp, UserMemory } from "@/types/memory";
import { authHeaders } from "@/lib/api/client";

const MAX_STORED_MEMORIES = 320;

function memoriesRef(userId: string) {
  return collection(getFirebaseDb(), COLLECTIONS.users, userId, COLLECTIONS.memories);
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
  return sortMemories(items).slice(0, MAX_STORED_MEMORIES);
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
      onChange(sortMemories(items).slice(0, MAX_STORED_MEMORIES));
    },
    (error) => onError?.(error),
  );
}

export async function addMemory(userId: string, raw: string): Promise<UserMemory | null> {
  const content = sanitizeMemoryContent(raw);
  if (!userId || !content) return null;
  const response = await fetch("/api/memory", { method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ operation: "add", content }) });
  const result = await response.json().catch(() => ({})) as { id?: string; error?: string };
  if (!response.ok || !result.id) throw new Error(result.error || "Could not save memory.");
  const now = new Date().toISOString();
  return {
    id: result.id,
    content,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateMemory(userId: string, memoryId: string, raw: string): Promise<void> {
  const content = sanitizeMemoryContent(raw);
  if (!userId || !memoryId || !content) return;
  const response = await fetch("/api/memory", { method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ operation: "update", id: memoryId, content }) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || "Could not update memory.");
  }
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  if (!userId || !memoryId) return;
  await deleteDoc(doc(getFirebaseDb(), COLLECTIONS.users, userId, COLLECTIONS.memories, memoryId));
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
    if (items.length >= MAX_STORED_MEMORIES) continue;
    const created = await addMemory(userId, content);
    if (created) {
      items = [created, ...items].slice(0, MAX_STORED_MEMORIES);
      saved = true;
    }
  }

  return saved;
}
