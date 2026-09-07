import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type Unsubscribe,
} from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { extractedTextPath } from "@/lib/materials/storage";
import { asString, toIsoDate } from "@/lib/timestamps";
import { MATERIAL_TYPES, type Material, type MaterialImage, type MaterialStatus, type MaterialType } from "@/types/material";

function materialsRef(projectId: string) {
  return collection(
    getFirebaseDb(),
    COLLECTIONS.projects,
    projectId,
    COLLECTIONS.materials,
  );
}

function asType(value: unknown): MaterialType {
  return typeof value === "string" && (MATERIAL_TYPES as readonly string[]).includes(value)
    ? (value as MaterialType)
    : "txt";
}

function asStatus(value: unknown): MaterialStatus {
  if (value === "uploading" || value === "processing" || value === "ready" || value === "failed") {
    return value;
  }
  return "ready";
}

function asImages(value: unknown): MaterialImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { page?: unknown; path?: unknown; mime?: unknown };
    if (typeof row.path !== "string" || !row.path) return [];
    return [
      {
        page: typeof row.page === "number" && Number.isFinite(row.page) ? Math.max(1, Math.floor(row.page)) : 1,
        path: row.path,
        mime: typeof row.mime === "string" && row.mime ? row.mime : "image/jpeg",
      },
    ];
  });
}

function mapMaterial(id: string, projectId: string, data: Record<string, unknown>): Material {
  const userId = asString(data.userId);
  return {
    id,
    projectId,
    userId,
    title: asString(data.title) || asString(data.name, "Untitled"),
    type: asType(data.type),
    storagePath: asString(data.storagePath),
    textPath: asString(data.textPath) || extractedTextPath(userId, projectId, id),
    extractedTextPreview: asString(data.extractedTextPreview).slice(0, 300),
    sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
    pageCount: typeof data.pageCount === "number" ? data.pageCount : 0,
    hasImages: data.hasImages === true,
    textChars: typeof data.textChars === "number" ? data.textChars : 0,
    images: asImages(data.images),
    status: asStatus(data.status),
    createdAt: toIsoDate(data.createdAt),
  };
}

export function newMaterialRef(projectId: string): DocumentReference {
  return doc(materialsRef(projectId));
}

export type MaterialDocInput = {
  userId: string;
  title: string;
  type: MaterialType;
  storagePath: string;
  textPath?: string;
  extractedTextPreview: string;
  sizeBytes: number;
  pageCount?: number;
  hasImages?: boolean;
  textChars?: number;
  images?: MaterialImage[];
  status?: MaterialStatus;
};

export async function writeMaterialDoc(
  projectId: string,
  materialId: string,
  data: MaterialDocInput,
): Promise<void> {
  const payload: Record<string, unknown> = {
    projectId,
    userId: data.userId,
    title: data.title,
    type: data.type,
    storagePath: data.storagePath,
    textPath: data.textPath ?? extractedTextPath(data.userId, projectId, materialId),
    extractedTextPreview: data.extractedTextPreview.slice(0, 300),
    sizeBytes: data.sizeBytes,
    pageCount: data.pageCount ?? 0,
    hasImages: Boolean(data.hasImages),
    textChars: data.textChars ?? 0,
    images: data.images ?? [],
    status: data.status ?? "ready",
  };
  if (data.status === "processing") payload.createdAt = serverTimestamp();
  await setDoc(doc(materialsRef(projectId), materialId), payload, { merge: true });
}

export function subscribeMaterials(
  projectId: string,
  onChange: (items: Material[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    materialsRef(projectId),
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => mapMaterial(item.id, projectId, item.data()))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      onChange(items);
    },
    (error) => onError?.(error),
  );
}

export async function listMaterials(projectId: string): Promise<Material[]> {
  const snapshot = await getDocs(materialsRef(projectId));
  return snapshot.docs
    .map((item) => mapMaterial(item.id, projectId, item.data()))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function deleteMaterialDoc(projectId: string, materialId: string): Promise<void> {
  await deleteDoc(doc(materialsRef(projectId), materialId));
}
