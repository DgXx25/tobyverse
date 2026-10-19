import {
  collection, deleteField, doc, getDocs, onSnapshot, query, runTransaction,
  serverTimestamp, where, type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore";
import { clearUntouchedNotebook } from "@/lib/workspace/draft-notebook";

export type SourceFolder = { id: string; name: string; deleting?: boolean };
export const SOURCE_DRAG_TYPE = "application/x-tobyverse-sources";

function validId(id: string): string {
  if (!id.trim() || id.includes("/") || id === "." || id === "..") throw new Error("Invalid source or folder.");
  return id;
}

function folderName(name: string): string {
  const value = name.trim();
  if (!value || value.length > 120) throw new Error("Use a folder name between 1 and 120 characters.");
  return value;
}

function foldersRef(projectId: string) {
  return collection(getFirebaseDb(), COLLECTIONS.projects, validId(projectId), "sourceFolders");
}

function sourceRef(projectId: string, id: string) {
  return doc(getFirebaseDb(), COLLECTIONS.projects, validId(projectId), COLLECTIONS.materials, validId(id));
}

export function subscribeSourceFolders(projectId: string, receive: (folders: SourceFolder[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(foldersRef(projectId), snapshot => receive(snapshot.docs.flatMap(item => {
    const data = item.data();
    return typeof data.name === "string" && data.name.trim()
      ? [{ id: item.id, name: data.name, deleting: data.deleting === true }]
      : [];
  }).sort((a, b) => a.name.localeCompare(b.name))), onError);
}

export async function createSourceFolder(projectId: string, name: string): Promise<string> {
  const value = folderName(name);
  const ref = doc(foldersRef(projectId));
  await runTransaction(getFirebaseDb(), async transaction => {
    transaction.set(ref, { name: value, createdAt: serverTimestamp() });
  });
  clearUntouchedNotebook(projectId);
  return ref.id;
}

export async function renameSourceFolder(projectId: string, id: string, name: string): Promise<void> {
  const value = folderName(name);
  const ref = doc(foldersRef(projectId), validId(id));
  await runTransaction(getFirebaseDb(), async transaction => {
    const folder = await transaction.get(ref);
    if (!folder.exists() || folder.data().deleting === true) throw new Error("This folder is no longer available.");
    transaction.update(ref, { name: value });
  });
}

/** All references are scoped to this project; rules additionally enforce its owner. */
export async function moveSourcesToFolder(projectId: string, materialIds: string[], folderId: string | null): Promise<void> {
  const ids = [...new Set(materialIds.map(validId))];
  const target = folderId ? doc(foldersRef(projectId), validId(folderId)) : null;
  const db = getFirebaseDb();
  // Stay below Firestore's transaction write limit for large photo selections.
  for (let offset = 0; offset < ids.length; offset += 400) {
    const refs = ids.slice(offset, offset + 400).map(id => sourceRef(projectId, id));
    await runTransaction(db, async transaction => {
      if (target) {
        const folder = await transaction.get(target);
        if (!folder.exists() || folder.data().deleting === true) throw new Error("This folder is no longer available.");
      }
      const sources = await Promise.all(refs.map(ref => transaction.get(ref)));
      if (sources.some(source => !source.exists())) throw new Error("A selected source is no longer available.");
      for (const ref of refs) transaction.update(ref, { folderId: folderId || deleteField() });
    });
  }
}

/** Folder removal never deletes material records or Storage objects. */
export async function deleteSourceFolder(projectId: string, id: string): Promise<void> {
  const folder = doc(foldersRef(projectId), validId(id));
  const db = getFirebaseDb();
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(folder);
    if (snapshot.exists()) transaction.update(folder, { deleting: true });
  });
  // The deleting flag prevents concurrent moves into this folder while its members return to root.
  const members = await getDocs(query(collection(db, COLLECTIONS.projects, projectId, COLLECTIONS.materials), where("folderId", "==", id)));
  for (let offset = 0; offset < members.docs.length; offset += 400) {
    const chunk = members.docs.slice(offset, offset + 400);
    await runTransaction(db, async transaction => {
      const snapshots = await Promise.all(chunk.map(item => transaction.get(item.ref)));
      for (const source of snapshots) {
        if (source.exists() && source.data().folderId === id) transaction.update(source.ref, { folderId: deleteField() });
      }
    });
  }
  await runTransaction(db, async transaction => { transaction.delete(folder); });
}

/** Unknown/deleted folder metadata must never make sources disappear. */
export function groupSourcesByFolder<T extends { folderId?: string }>(items: T[], folders: SourceFolder[]): { root: T[]; folders: Map<string, T[]> } {
  const groups = new Map<string, T[]>(folders.map(folder => [folder.id, []]));
  const root: T[] = [];
  for (const item of items) (item.folderId ? groups.get(item.folderId) || root : root).push(item);
  return { root, folders: groups };
}
