import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { COLLECTIONS, omitUndefined } from "@/lib/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { requireSignedInUser } from "@/lib/auth";
import { PREVIEW_HTML_MAX } from "@/lib/materials/limits";
import { extractedTextPath } from "@/lib/materials/storage";
import { storedObjectName } from "@/lib/materials/storage-path";
import { mimeFromName } from "@/lib/materials/types";
import { asString, toIsoDate } from "@/lib/timestamps";
import { MATERIAL_TYPES, type Material, type MaterialImage, type MaterialIndex, type MaterialStatus, type MaterialType } from "@/types/material";

const MATERIAL_COUNT_CACHE_MS = 10_000;
const MATERIAL_COUNT_BATCH_SIZE = 100;
const materialCountCache = new Map<string, { count: number; expiresAt: number }>();
const materialCountRequests = new Map<string, Promise<Record<string, number>>>();

function materialCountCacheKey(uid: string, projectId: string): string {
  return `${uid}\u0000${projectId}`;
}

export function invalidateMaterialCount(projectId: string): void {
  for (const key of materialCountCache.keys()) {
    if (key.endsWith(`\u0000${projectId}`)) materialCountCache.delete(key);
  }
}

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
  const row = value as { status?: unknown; chunks?: unknown; nextPage?: unknown; total?: unknown };
  const status = row.status === "ready" || row.status === "failed" ? row.status : "indexing";
  return {
    status,
    chunks: typeof row.chunks === "number" ? row.chunks : 0,
    ...(typeof row.nextPage === "number" ? { nextPage: row.nextPage } : {}),
    ...(typeof row.total === "number" ? { total: row.total } : {}),
  };
}

function mapMaterial(id: string, projectId: string, data: Record<string, unknown>): Material {
  const userId = asString(data.userId);
  const storagePath = asString(data.storagePath);
  const extractedPath =
    asString(data.extractedPath) || asString(data.textPath) || extractedTextPath(userId, projectId, id);
  const originalRemoved = data.originalRemoved === true;
  const fromField = asString(data.originalName);
  const fromPath = storedObjectName(storagePath) || "";
  const originalName = fromField !== "extracted.txt" || originalRemoved ? fromField : "";
  const pathName = fromPath && fromPath !== "extracted.txt" ? fromPath : "";
  return {
    id,
    projectId,
    userId,
    title: asString(data.title) || asString(data.name, "Untitled"),
    type: asType(data.type),
    folderId: asString(data.folderId) || undefined,
    originalName: originalName || pathName || undefined,
    originalMime: asString(data.originalMime) || undefined,
    storedMime: asString(data.storedMime) || undefined,
    originalSizeBytes: typeof data.originalSizeBytes === "number" ? data.originalSizeBytes : undefined,
    originalRemoved,
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
  originalName?: string;
  originalMime?: string;
  storedMime?: string;
  originalSizeBytes?: number;
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
    ...(data.originalName ? { originalName: data.originalName } : {}),
    ...(data.originalMime ? { originalMime: data.originalMime } : {}),
    ...(data.storedMime ? { storedMime: data.storedMime } : {}),
    ...(typeof data.originalSizeBytes === "number" ? { originalSizeBytes: data.originalSizeBytes } : {}),
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
  invalidateMaterialCount(projectId);
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
  const counts = await countMaterialsForProjects([projectId]);
  const count = counts[projectId];
  if (typeof count !== "number") throw new Error("Could not count project sources.");
  return count;
}

async function loadMaterialCountBatch(user: User, projectIds: string[]): Promise<Record<string, number>> {
  const userId = user.uid;
  const now = Date.now();
  const cached: Record<string, number> = {};
  const missing: string[] = [];
  for (const projectId of projectIds) {
    const entry = materialCountCache.get(materialCountCacheKey(userId, projectId));
    if (entry && entry.expiresAt > now) cached[projectId] = entry.count;
    else {
      materialCountCache.delete(materialCountCacheKey(userId, projectId));
      missing.push(projectId);
    }
  }
  if (missing.length === 0) return cached;

  const requestKey = `${userId}\u0000${[...missing].sort().join("\u0000")}`;
  let request = materialCountRequests.get(requestKey);
  if (!request) {
    request = (async () => {
      const token = await user.getIdToken();
      const response = await fetch("/api/materials/count", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectIds: missing }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { counts?: unknown; error?: unknown };
      if (!response.ok || !data.counts || typeof data.counts !== "object") {
        throw new Error(typeof data.error === "string" ? data.error : "Could not count project sources.");
      }

      const responseCounts = Object.create(null) as Record<string, number>;
      for (const projectId of missing) {
        const count = (data.counts as Record<string, unknown>)[projectId];
        if (typeof count !== "number") throw new Error("Could not count project sources.");
        responseCounts[projectId] = count;
        materialCountCache.set(materialCountCacheKey(userId, projectId), {
          count,
          expiresAt: Date.now() + MATERIAL_COUNT_CACHE_MS,
        });
      }
      return responseCounts;
    })();
    materialCountRequests.set(requestKey, request);
  }

  try {
    return { ...cached, ...await request };
  } finally {
    if (materialCountRequests.get(requestKey) === request) materialCountRequests.delete(requestKey);
  }
}

export async function countMaterialsForProjects(projectIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(projectIds.map((projectId) => projectId.trim()).filter(Boolean))];
  if (ids.length === 0) return {};
  const user = await requireSignedInUser();
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += MATERIAL_COUNT_BATCH_SIZE) {
    batches.push(ids.slice(index, index + MATERIAL_COUNT_BATCH_SIZE));
  }
  const result = await Promise.all(batches.map((batch) => loadMaterialCountBatch(user, batch)));
  return Object.assign({}, ...result);
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
      return Boolean(item?.extractedTextPreview.trim() || (item?.type === "image" && item.status === "ready" && item.hasImages));
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
  invalidateMaterialCount(projectId);
}

export async function patchMaterialStatus(projectId: string, materialId: string, status: MaterialStatus): Promise<void> {
  await updateDoc(doc(materialsRef(projectId), materialId), { status });
}
