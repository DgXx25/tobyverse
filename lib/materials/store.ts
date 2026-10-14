import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Unsubscribe,
} from "firebase/firestore";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { PREVIEW_HTML_MAX } from "@/lib/materials/limits";
import { extractedTextPath } from "@/lib/materials/storage";
import { storedObjectName } from "@/lib/materials/storage-path";
import { mimeFromName } from "@/lib/materials/types";
import { asString, toIsoDate } from "@/lib/timestamps";
import { MATERIAL_TYPES, type Material, type MaterialImage, type MaterialIndex, type MaterialStatus, type MaterialType } from "@/types/material";

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

function pageFromName(path: string): number {
  const name = storedObjectName(path);
  const match = name?.match(/^(?:slide|page)-(\d+)/i);
  const page = match ? Number(match[1]) : 0;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function asImages(value: unknown): MaterialImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item) {
      return [
        {
          page: pageFromName(item),
          path: item,
          mime: mimeFromName(storedObjectName(item) || item),
        },
      ];
    }
    if (!item || typeof item !== "object") return [];
    const row = item as { page?: unknown; path?: unknown; mime?: unknown; kind?: unknown };
    if (typeof row.path !== "string" || !row.path) return [];
    const namedPage = pageFromName(row.path);
    return [
      {
        page:
          typeof row.page === "number" && Number.isFinite(row.page) && row.page > 0
            ? Math.floor(row.page)
            : namedPage,
        path: row.path,
        mime: typeof row.mime === "string" && row.mime ? row.mime : mimeFromName(storedObjectName(row.path) || row.path),
        ...(row.kind === "page" || row.kind === "figure" ? { kind: row.kind } : {}),
      },
    ];
  });
}

function mergeImages(images: unknown, imagePaths: unknown): MaterialImage[] {
  const fromImages = asImages(images);
  const fromPaths = asImages(imagePaths);
  if (fromImages.length === 0) return fromPaths;
  const seen = new Set(fromImages.map((item) => storedObjectName(item.path) || item.path));
  const extra = fromPaths.filter((item) => {
    const name = storedObjectName(item.path) || item.path;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  return extra.length ? [...fromImages, ...extra] : fromImages;
}

function asIndex(value: unknown): MaterialIndex | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as { status?: unknown; chunks?: unknown };
  const status = row.status === "ready" || row.status === "failed" ? row.status : "indexing";
  return { status, chunks: typeof row.chunks === "number" ? row.chunks : 0 };
}

function mapMaterial(id: string, projectId: string, data: Record<string, unknown>): Material {
  const userId = asString(data.userId);
  const storagePath = asString(data.storagePath);
  const extractedPath =
    asString(data.extractedPath) || asString(data.textPath) || extractedTextPath(userId, projectId, id);
  const fromField = asString(data.originalName);
  const fromPath = storedObjectName(storagePath) || "";
  const originalName = fromField !== "extracted.txt" ? fromField : "";
  const pathName = fromPath && fromPath !== "extracted.txt" ? fromPath : "";
  return {
    id,
    projectId,
    userId,
    title: asString(data.title) || asString(data.name, "Untitled"),
    type: asType(data.type),
    originalName: originalName || pathName || undefined,
    storagePath,
    textPath: extractedPath,
    extractedPath,
    extractedTextPreview: asString(data.extractedTextPreview).slice(0, 300),
    previewHtml: asString(data.previewHtml).slice(0, PREVIEW_HTML_MAX) || undefined,
    previewPagePath: asString(data.previewPagePath) || undefined,
    sizeBytes: typeof data.sizeBytes === "number" ? data.sizeBytes : 0,
    pageCount: typeof data.pageCount === "number" ? data.pageCount : 0,
    hasImages: data.hasImages === true,
    textChars: typeof data.textChars === "number" ? data.textChars : 0,
    images: mergeImages(data.images, data.imagePaths),
    index: asIndex(data.index),
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
    ...(data.type === "pdf" && !data.textPath ? {} : { textPath: data.textPath ?? extractedTextPath(data.userId, projectId, materialId) }),
    extractedTextPreview: data.extractedTextPreview.slice(0, 300),
    sizeBytes: data.sizeBytes,
    pageCount: data.pageCount ?? 0,
    hasImages: Boolean(data.hasImages),
    textChars: data.textChars ?? 0,
    images: data.images ?? [],
    status: data.status ?? "ready",
  };
  if (data.status === "processing") payload.createdAt = serverTimestamp();
  await setDoc(doc(materialsRef(projectId), materialId), omitUndefined(payload), { merge: true });
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

export async function getMaterial(projectId: string, materialId: string): Promise<Material | null> {
  const snap = await getDoc(doc(materialsRef(projectId), materialId));
  if (!snap.exists()) return null;
  return mapMaterial(snap.id, projectId, snap.data());
}

export async function countMaterials(projectId: string): Promise<number> {
  const snapshot = await getCountFromServer(materialsRef(projectId));
  return snapshot.data().count;
}

export async function listMaterials(projectId: string): Promise<Material[]> {
  const snapshot = await getDocs(materialsRef(projectId));
  return snapshot.docs
    .map((item) => mapMaterial(item.id, projectId, item.data()))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function waitForMaterialPreviews(
  projectId: string,
  materialIds: string[],
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<Material[]> {
  const timeoutMs = options?.timeoutMs ?? 25_000;
  const intervalMs = options?.intervalMs ?? 350;
  const ids = materialIds.filter((id) => id.trim());
  const deadline = Date.now() + timeoutMs;

  const load = () => listMaterials(projectId);
  let latest = await load();
  if (ids.length === 0) return latest;

  while (true) {
    const failed = latest.find((item) => ids.includes(item.id) && item.status === "failed");
    if (failed) {
      throw new Error(failed.title.trim() ? `Could not read ${failed.title}.` : "Could not read that file.");
    }
    const ready = ids.every((id) => {
      const item = latest.find((row) => row.id === id);
      return Boolean(item?.extractedTextPreview.trim());
    });
    if (ready) return latest;
    if (Date.now() >= deadline) {
      throw new Error("Could not read that file.");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    latest = await load();
  }
}

export async function patchMaterialPreviewHtml(
  projectId: string,
  materialId: string,
  previewHtml: string,
): Promise<void> {
  const html = previewHtml.slice(0, PREVIEW_HTML_MAX);
  if (!html) return;
  await setDoc(doc(materialsRef(projectId), materialId), { previewHtml: html }, { merge: true });
}

export async function renameMaterial(projectId: string, materialId: string, title: string): Promise<void> {
  const next = title.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!next) return;
  await updateDoc(doc(materialsRef(projectId), materialId), { title: next });
}

export async function deleteMaterialDoc(projectId: string, materialId: string): Promise<void> {
  await deleteDoc(doc(materialsRef(projectId), materialId));
}
