import { requireSignedInUser } from "@/lib/auth";
import { authHeaders } from "@/lib/api/client";
import { trackEvent } from "@/lib/analytics/track";
import { adjustStorageBytes, reserveStorageBytes } from "@/lib/account/store";
import { previewText, MAX_UPLOAD_BYTES, uploadTooLargeMessage } from "@/lib/materials/limits";
import { newMaterialRef, writeMaterialDoc } from "@/lib/materials/store";
import {
  deleteStoragePath,
  extractedTextPath,
  originalStoragePath,
  slideImagePath,
  uploadExtractedText,
  uploadMaterialBytes,
} from "@/lib/materials/storage";
import { inferMaterialType, materialFileName, mimeFromName } from "@/lib/materials/types";
import type { MaterialImage, MaterialType } from "@/types/material";

export type ExtractResponse = {
  text?: string;
  preview?: string;
  type?: MaterialType;
  title?: string;
  pageCount?: number;
  images?: { page?: number; mime?: string; data?: string }[];
  error?: string;
};

export type IngestSource =
  | { kind: "file"; file: File }
  | { kind: "paste"; text: string; title?: string }
  | { kind: "url"; url: string; title?: string };

export type IngestPhase = "uploading" | "reading";

export type PreparedMaterial = {
  projectId: string;
  userId: string;
  materialId: string;
  type: MaterialType;
  title: string;
  originalMime: string;
  sizeBytes: number;
  storagePath: string;
  textPath: string;
  data: ExtractResponse;
  sourceFile?: File;
  /** True until a material doc exists (delete then owns the bytes). */
  storageHeld: boolean;
};

function bytesFromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveFromApi(
  source: IngestSource,
  phase: "text" | "images" | "all" = "text",
): Promise<ExtractResponse> {
  if (source.kind === "file") {
    const form = new FormData();
    form.set("file", source.file);
    form.set("phase", phase);
    const response = await fetch("/api/materials/extract", {
      method: "POST",
      headers: await authHeaders(false),
      body: form,
    });
    const data = (await response.json()) as ExtractResponse;
    if (!response.ok) data.error = data.error ?? "Extraction failed.";
    return data;
  }

  const response = await fetch("/api/materials/extract", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(
      source.kind === "paste"
        ? { text: source.text, title: source.title }
        : { url: source.url, title: source.title },
    ),
  });
  const data = (await response.json()) as ExtractResponse;
  if (!response.ok) data.error = data.error ?? "Extraction failed.";
  return data;
}

function sourcePayload(source: IngestSource): {
  type: MaterialType;
  title: string;
  originalName: string;
  originalBytes: Blob | Uint8Array;
  originalMime: string;
  sizeBytes: number;
} {
  if (source.kind === "file") {
    if (source.file.size > MAX_UPLOAD_BYTES) {
      throw new Error(uploadTooLargeMessage());
    }
    const inferred = inferMaterialType(source.file.name, source.file.type);
    if (!inferred) {
      throw new Error("Only PDF, DOCX, PPTX, TXT, MD, and PNG/JPG/WEBP files are supported.");
    }
    return {
      type: inferred,
      title: source.file.name.replace(/\.[^.]+$/, "") || source.file.name,
      originalName: materialFileName(inferred, source.file.name),
      originalBytes: source.file,
      originalMime: source.file.type || mimeFromName(source.file.name),
      sizeBytes: source.file.size,
    };
  }
  if (source.kind === "paste") {
    const originalBytes = new TextEncoder().encode(source.text);
    return {
      type: "paste",
      title: source.title?.trim() || "Pasted notes",
      originalName: materialFileName("paste", "notes.txt"),
      originalBytes,
      originalMime: "text/plain; charset=utf-8",
      sizeBytes: originalBytes.byteLength,
    };
  }
  const originalBytes = new TextEncoder().encode(source.url);
  return {
    type: "url",
    title: source.title?.trim() || source.url,
    originalName: materialFileName("url", "source.txt"),
    originalBytes,
    originalMime: "text/plain; charset=utf-8",
    sizeBytes: originalBytes.byteLength,
  };
}

/** Upload original + extract TEXT. Does not pack slide images unless includeImages. Does not write Firestore. */
export async function prepareMaterialIngest(input: {
  projectId: string;
  userId: string;
  source: IngestSource;
  onPhase?: (phase: IngestPhase) => void;
  includeImages?: boolean;
}): Promise<PreparedMaterial> {
  const signedIn = await requireSignedInUser();
  const userId = signedIn.uid;
  const { projectId, source } = input;
  const ref = newMaterialRef(projectId);
  const payload = sourcePayload(source);
  const storagePath = originalStoragePath(userId, projectId, ref.id, payload.originalName);
  const textPath = extractedTextPath(userId, projectId, ref.id);

  await reserveStorageBytes(userId, payload.sizeBytes);
  let storageHeld = true;

  try {
    input.onPhase?.("uploading");
    await uploadMaterialBytes(storagePath, payload.originalBytes, payload.originalMime);

    input.onPhase?.("reading");
    const data = await deriveFromApi(source, input.includeImages ? "all" : "text");
    if (!data.text || !data.type) {
      throw new Error(data.error ?? "Extraction failed.");
    }
    return {
      projectId,
      userId,
      materialId: ref.id,
      type: payload.type,
      title: payload.title,
      originalMime: payload.originalMime,
      sizeBytes: payload.sizeBytes,
      storagePath,
      textPath,
      data,
      sourceFile: source.kind === "file" ? source.file : undefined,
      storageHeld,
    };
  } catch (error) {
    await deleteStoragePath(storagePath);
    if (storageHeld) {
      storageHeld = false;
      void adjustStorageBytes(userId, -payload.sizeBytes);
    }
    throw error instanceof Error ? error : new Error("Extraction failed.");
  }
}

async function releasePreparedStorage(item: PreparedMaterial): Promise<void> {
  if (!item.storageHeld || !item.sizeBytes) return;
  item.storageHeld = false;
  await adjustStorageBytes(item.userId, -item.sizeBytes);
}

export async function discardPreparedMaterials(prepared: PreparedMaterial[]): Promise<void> {
  await Promise.all(
    prepared.map(async (item) => {
      await deleteStoragePath(item.storagePath);
      await releasePreparedStorage(item);
    }),
  );
}

async function slideImagesFromExtract(
  prepared: PreparedMaterial,
  images: ExtractResponse["images"],
): Promise<MaterialImage[]> {
  const { projectId, userId, materialId } = prepared;
  const counts = new Map<number, number>();
  const uploaded: MaterialImage[] = [];
  for (const item of images ?? []) {
    if (typeof item.data !== "string" || !item.data) continue;
    const page = typeof item.page === "number" && item.page > 0 ? Math.floor(item.page) : 1;
    const mime = typeof item.mime === "string" && item.mime.startsWith("image/") ? item.mime : "image/jpeg";
    const index = counts.get(page) ?? 0;
    counts.set(page, index + 1);
    const path = slideImagePath(userId, projectId, materialId, page, mime, index);
    await uploadMaterialBytes(path, bytesFromBase64(item.data), mime);
    uploaded.push({ page, path, mime });
  }
  return uploaded;
}

function previewFromPrepared(prepared: PreparedMaterial): string {
  const text = prepared.data.text ?? "";
  return prepared.data.preview || previewText(text);
}

/** Text + preview on the material doc. PPTX stays processing until slide images finish. */
export async function commitMaterialText(prepared: PreparedMaterial): Promise<string> {
  const { projectId, userId, materialId, storagePath, textPath, data } = prepared;
  const type = data.type ?? prepared.type;
  const title = data.title?.trim() || prepared.title;
  const needsSlideImages = type === "pptx";

  await writeMaterialDoc(projectId, materialId, {
    userId,
    title: prepared.title,
    type: prepared.type,
    storagePath,
    textPath,
    extractedTextPreview: "",
    sizeBytes: prepared.sizeBytes,
    status: "processing",
  });
  prepared.storageHeld = false;

  try {
    if (!data.text || !data.type) {
      throw new Error(data.error ?? "Extraction failed.");
    }

    await uploadExtractedText(textPath, data.text);

    const images: MaterialImage[] =
      type === "image"
        ? [{ page: 1, path: storagePath, mime: prepared.originalMime || "image/jpeg" }]
        : [];

    await writeMaterialDoc(projectId, materialId, {
      userId,
      title,
      type,
      storagePath,
      textPath,
      extractedTextPreview: previewFromPrepared(prepared),
      sizeBytes: prepared.sizeBytes,
      pageCount: data.pageCount ?? 1,
      hasImages: images.length > 0,
      textChars: data.text.length,
      images,
      status: needsSlideImages ? "processing" : "ready",
    });

    if (!needsSlideImages) {
      trackEvent({
        userId,
        projectId,
        type: "material_uploaded",
        value: type,
      });
    }

    return materialId;
  } catch (error) {
    await writeMaterialDoc(projectId, materialId, {
      userId,
      title: prepared.title,
      type: prepared.type,
      storagePath,
      textPath,
      extractedTextPreview: "",
      sizeBytes: prepared.sizeBytes,
      status: "failed",
    });
    throw error instanceof Error ? error : new Error("Extraction failed.");
  }
}

/** Background: extract and upload slide images. Does not block chat. */
export async function finalizeMaterialImages(prepared: PreparedMaterial): Promise<void> {
  const type = prepared.data.type ?? prepared.type;
  if (type !== "pptx") return;

  const { projectId, userId, materialId, storagePath, textPath, data } = prepared;
  const title = data.title?.trim() || prepared.title;
  const preview = previewFromPrepared(prepared);
  const text = data.text ?? "";

  try {
    let images: MaterialImage[] = [];
    const cached = (prepared.data.images ?? []).filter((item) => typeof item.data === "string" && item.data);
    if (cached.length > 0) {
      images = await slideImagesFromExtract(prepared, cached);
    } else if (prepared.sourceFile) {
      const extracted = await deriveFromApi({ kind: "file", file: prepared.sourceFile }, "images");
      images = await slideImagesFromExtract(prepared, extracted.images);
    }

    await writeMaterialDoc(projectId, materialId, {
      userId,
      title,
      type,
      storagePath,
      textPath,
      extractedTextPreview: preview,
      sizeBytes: prepared.sizeBytes,
      pageCount: data.pageCount ?? 1,
      hasImages: images.length > 0,
      textChars: text.length,
      images,
      status: "ready",
    });

    trackEvent({
      userId,
      projectId,
      type: "material_uploaded",
      value: type,
    });
  } catch (error) {
    console.error("Slide image ingest failed; keeping text preview.", error);
    await writeMaterialDoc(projectId, materialId, {
      userId,
      title,
      type,
      storagePath,
      textPath,
      extractedTextPreview: preview,
      sizeBytes: prepared.sizeBytes,
      pageCount: data.pageCount ?? 1,
      hasImages: false,
      textChars: text.length,
      images: [],
      status: "ready",
    });
  }
}

/** Write material docs and extracted sidecars. Parent project must exist (Firestore rules). */
export async function finalizeMaterialIngest(prepared: PreparedMaterial): Promise<string> {
  const materialId = await commitMaterialText(prepared);
  await finalizeMaterialImages(prepared);
  return materialId;
}

/** Original file goes to Storage first. Then derive text/images. Never keep a File for chat. */
export async function ingestMaterial(input: {
  projectId: string;
  userId: string;
  source: IngestSource;
}): Promise<string> {
  const prepared = await prepareMaterialIngest({ ...input, includeImages: true });
  try {
    return await finalizeMaterialIngest(prepared);
  } catch (error) {
    if (prepared.storageHeld) await discardPreparedMaterials([prepared]);
    throw error;
  }
}

export async function ingestMaterialFile(input: {
  projectId: string;
  userId: string;
  file: File;
}): Promise<string> {
  return ingestMaterial({ projectId: input.projectId, userId: input.userId, source: { kind: "file", file: input.file } });
}

export async function ingestMaterialPaste(input: {
  projectId: string;
  userId: string;
  text: string;
  title?: string;
}): Promise<string> {
  return ingestMaterial({
    projectId: input.projectId,
    userId: input.userId,
    source: { kind: "paste", text: input.text, title: input.title },
  });
}

export async function ingestMaterialUrl(input: {
  projectId: string;
  userId: string;
  url: string;
  title?: string;
}): Promise<string> {
  return ingestMaterial({
    projectId: input.projectId,
    userId: input.userId,
    source: { kind: "url", url: input.url, title: input.title },
  });
}

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export const LARGE_PASTE_CHARS = 500;
