import { requireSignedInUser } from "@/lib/auth";
import { authHeaders } from "@/lib/api/client";
import { previewText } from "@/lib/materials/limits";
import { newMaterialRef, patchMaterialStatus, writeMaterialDoc } from "@/lib/materials/store";
import {
  deleteStoragePath,
  extractedTextPath,
  originalStoragePath,
  releaseStoragePool,
  uploadExtractedText,
  uploadMaterialBytes,
} from "@/lib/materials/storage";
import { inferMaterialType, materialFileName, mimeFromName } from "@/lib/materials/types";
import type { MaterialImage, MaterialType } from "@/types/material";
import { clearUntouchedNotebook } from "@/lib/workspace/draft-notebook";
import { compressImageForUpload } from "@/lib/materials/compress-image";

export type MaterialIngestFailurePhase = "storage" | "extract" | "network";

export class MaterialIngestError extends Error {
  readonly status?: number;
  readonly phase: MaterialIngestFailurePhase;
  readonly storageSaved: boolean;

  constructor(
    message: string,
    options: {
      phase: MaterialIngestFailurePhase;
      status?: number;
      storageSaved?: boolean;
    },
  ) {
    super(message);
    this.name = "MaterialIngestError";
    this.status = options.status;
    this.phase = options.phase;
    this.storageSaved = options.storageSaved === true;
  }
}

export type ExtractResponse = {
  text?: string;
  preview?: string;
  type?: MaterialType;
  title?: string;
  pageCount?: number;
  textChars?: number;
  textStored?: boolean;
  /** PDFs are indexed server-side while reading; there is no text to carry back. */
  indexed?: boolean;
  error?: string;
};

export type IngestSource =
  | { kind: "file"; file: File; title?: string }
  | { kind: "paste"; text: string; title?: string }
  | { kind: "url"; url: string; title?: string };

export type IngestPhase = "uploading" | "reading";
export type IngestProgress = { phase: IngestPhase; percent?: number };

export type PreparedMaterial = {
  projectId: string;
  userId: string;
  materialId: string;
  type: MaterialType;
  title: string;
  originalMime: string;
  originalName: string;
  originalSizeBytes: number;
  storedMime: string;
  sizeBytes: number;
  storagePath: string;
  textPath: string;
  data: ExtractResponse;
  /** True until a material doc exists (delete then owns the bytes). */
  storageHeld: boolean;
};

async function deriveFromStorage(
  stored: { path: string; textPath: string },
): Promise<ExtractResponse> {
  let response: Response;
  try {
    response = await fetch("/api/materials/extract", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ path: stored.path, textPath: stored.textPath, phase: "text" }),
    });
  } catch {
    throw new MaterialIngestError("Network error. Try again.", { phase: "network" });
  }
  const data = (await response.json()) as ExtractResponse;
  if (!response.ok) {
    throw new MaterialIngestError(data.error ?? "Extraction failed.", {
      phase: "extract",
      status: response.status,
    });
  }
  return data;
}

async function deriveFromApi(source: IngestSource): Promise<ExtractResponse> {
  if (source.kind === "file") {
    const form = new FormData();
    form.set("file", source.file);
    form.set("phase", "text");
    let response: Response;
    try {
      response = await fetch("/api/materials/extract", {
        method: "POST",
        headers: await authHeaders(false),
        body: form,
      });
    } catch {
      throw new MaterialIngestError("Network error. Try again.", { phase: "network" });
    }
    const data = (await response.json()) as ExtractResponse;
    if (!response.ok) {
      throw new MaterialIngestError(data.error ?? "Extraction failed.", {
        phase: "extract",
        status: response.status,
      });
    }
    return data;
  }

  let response: Response;
  try {
    response = await fetch("/api/materials/extract", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(
        source.kind === "paste"
          ? { text: source.text, title: source.title }
          : { url: source.url, title: source.title },
      ),
    });
  } catch {
    throw new MaterialIngestError("Network error. Try again.", { phase: "network" });
  }
  const data = (await response.json()) as ExtractResponse;
  if (!response.ok) {
    throw new MaterialIngestError(data.error ?? "Extraction failed.", {
      phase: "extract",
      status: response.status,
    });
  }
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
    const inferred = inferMaterialType(source.file.name, source.file.type);
    if (!inferred) {
      throw new Error("Only PDF, DOCX, PPTX, XLS/XLSX, TXT, MD, and PNG/JPG/WEBP files are supported.");
    }
    return {
      type: inferred,
      title: source.title?.trim() || source.file.name.replace(/\.[^.]+$/, "") || source.file.name,
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

/**
 * Upload a compressed photo or a document, then extract text. PDFs are indexed on the
 * server while they are read. Other types return text that is indexed after the doc is committed.
 */
export async function prepareMaterialIngest(input: {
  projectId: string;
  userId: string;
  source: IngestSource;
  onPhase?: (phase: IngestPhase) => void;
  onProgress?: (progress: IngestProgress) => void;
}): Promise<PreparedMaterial> {
  const signedIn = await requireSignedInUser();
  const userId = signedIn.uid;
  const { projectId, source } = input;
  const ref = newMaterialRef(projectId);
  const payload = sourcePayload(source);
  const originalSizeBytes = payload.sizeBytes;
  if (source.kind === "file" && payload.type === "image") {
    const compressed = await compressImageForUpload(source.file);
    payload.originalBytes = compressed.blob;
    payload.originalName = compressed.name;
    payload.sizeBytes = compressed.blob.size;
    // Original identity is persisted separately from the stored representation.
    payload.originalMime = compressed.mime;
  }
  let storagePath = originalStoragePath(userId, projectId, ref.id, payload.originalName);
  const textPath = extractedTextPath(userId, projectId, ref.id);
  let sizeBytes = payload.sizeBytes;
  let storedMime = payload.originalMime;
  const originalMime = source.kind === "file" ? source.file.type || mimeFromName(source.file.name) : payload.originalMime;
  let storageHeld = false;
  let storageUploaded = false;
  let pdfStarted = false;

  try {
    input.onPhase?.("uploading");
    input.onProgress?.({ phase: "uploading", percent: 0 });
    const uploaded = await uploadMaterialBytes(storagePath, payload.originalBytes, payload.originalMime, {
      reservePool: true,
      originalName: payload.originalName,
      onProgress: (fraction) => input.onProgress?.({ phase: "uploading", percent: Math.round(fraction * 100) }),
    });
    storagePath = uploaded.path;
    sizeBytes = uploaded.sizeBytes;
    storedMime = uploaded.contentType;
    storageHeld = uploaded.reservedBytes > 0;
    storageUploaded = true;

    input.onPhase?.("reading");
    input.onProgress?.({ phase: "reading" });
    let data: ExtractResponse;
    if (source.kind === "file" && payload.type === "pdf") {
      await writeMaterialDoc(projectId, ref.id, {
        userId,
        title: payload.title,
        type: "pdf",
        storagePath,
        originalName: source.kind === "file" ? source.file.name : payload.originalName,
        originalMime,
        originalSizeBytes: sizeBytes,
        extractedTextPreview: "",
        sizeBytes,
        pageCount: 0,
        status: "processing",
      });
      pdfStarted = true;
      let completed = false;
      data = {};
      while (!completed) {
        let response: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            response = await fetch("/api/materials/pdf-batch", {
              method: "POST",
              headers: await authHeaders(),
              body: JSON.stringify({ path: storagePath, projectId, materialId: ref.id }),
            });
            if (response.ok || response.status < 500 || attempt === 2) break;
          } catch {
            if (attempt === 2) {
              throw new MaterialIngestError("Network error while reading PDF pages. Retry to resume.", { phase: "network", storageSaved: true });
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
        if (!response) throw new MaterialIngestError("Network error while reading PDF pages. Retry to resume.", { phase: "network", storageSaved: true });
        const progressData = (await response.json()) as ExtractResponse & { done?: boolean; pageCount?: number; nextPage?: number };
        data = progressData;
        if (!response.ok) throw new MaterialIngestError(progressData.error ?? "PDF extraction failed.", { phase: "extract", status: response.status, storageSaved: true });
        if (typeof progressData.pageCount === "number" && progressData.pageCount > 0 && typeof progressData.nextPage === "number") {
          const percent = Math.min(100, Math.round(((progressData.nextPage - 1) / progressData.pageCount) * 100));
          input.onProgress?.({ phase: "reading", percent });
        }
        completed = progressData.done === true;
      }
      data.type = "pdf";
      data.indexed = true;
    } else {
      data = source.kind === "file"
        ? await deriveFromStorage({ path: storagePath, textPath })
        : await deriveFromApi(source);
    }
    if ((!data.text && !data.textStored && !data.indexed && payload.type !== "image") || !data.type) {
      throw new Error(data.error ?? "Extraction failed.");
    }
    return {
      projectId,
      userId,
      materialId: ref.id,
      type: payload.type,
      title: payload.title,
      originalMime,
      storedMime,
      originalSizeBytes,
      originalName: source.kind === "file" ? source.file.name : payload.originalName,
      sizeBytes,
      storagePath,
      textPath,
      data,
      storageHeld,
    };
  } catch (error) {
    if (storageUploaded) {
      if (payload.type === "pdf" && pdfStarted) {
        storageHeld = false;
        if (error instanceof MaterialIngestError) throw error;
        throw new MaterialIngestError("PDF processing paused. Retry to resume saved pages.", {
          phase: "extract",
          storageSaved: true,
        });
      }
      if (payload.type === "pdf") {
        await deleteStoragePath(storagePath);
        if (storageHeld) {
          storageHeld = false;
          await releaseStoragePool(sizeBytes).catch(() => undefined);
        }
        throw error instanceof Error ? error : new Error("PDF upload failed.");
      }
      try {
        await writeMaterialDoc(projectId, ref.id, {
          userId,
          title: payload.title,
          type: payload.type,
          storagePath,
          textPath,
          originalName: source.kind === "file" ? source.file.name : payload.originalName,
          originalMime,
          originalSizeBytes,
          storedMime,
          extractedTextPreview: "",
          sizeBytes,
          status: "processing",
        });
        await writeMaterialDoc(projectId, ref.id, {
          userId,
          title: payload.title,
          type: payload.type,
          storagePath,
          textPath,
          originalName: source.kind === "file" ? source.file.name : payload.originalName,
          originalMime,
          originalSizeBytes,
          storedMime,
          extractedTextPreview: "",
          sizeBytes,
          status: "failed",
        });
        storageHeld = false;
      } catch {
        await deleteStoragePath(storagePath);
        if (storageHeld) {
          storageHeld = false;
          await releaseStoragePool(sizeBytes).catch(() => undefined);
        }
        throw error instanceof Error ? error : new Error("Extraction failed.");
      }
      throw new MaterialIngestError("Saved, but text could not be read", {
        phase: "extract",
        storageSaved: true,
      });
    }
    await deleteStoragePath(storagePath);
    if (storageHeld) {
      storageHeld = false;
      await releaseStoragePool(sizeBytes).catch(() => undefined);
    }
    throw error instanceof Error ? error : new Error("Upload failed.");
  }
}

async function releasePreparedStorage(item: PreparedMaterial): Promise<void> {
  if (!item.storageHeld || !item.sizeBytes) return;
  item.storageHeld = false;
  await releaseStoragePool(item.sizeBytes);
}

export async function discardPreparedMaterials(prepared: PreparedMaterial[]): Promise<void> {
  await Promise.all(
    prepared.map(async (item) => {
      await deleteStoragePath(item.storagePath);
      if (item.textPath !== item.storagePath) await deleteStoragePath(item.textPath);
      await releasePreparedStorage(item);
    }),
  );
}

function previewFromPrepared(prepared: PreparedMaterial): string {
  const text = prepared.data.text ?? "";
  return prepared.data.preview || previewText(text);
}

type IndexStepResponse = { done?: boolean; error?: string };

/** Non-PDF text is chunked and embedded server-side in time-boxed steps; keep calling until done. */
async function indexMaterialText(projectId: string, materialId: string): Promise<void> {
  for (let step = 0; step < 200; step += 1) {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch("/api/materials/index", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ projectId, materialId }),
        });
        if (response.ok || response.status < 500 || attempt === 2) break;
      } catch {
        if (attempt === 2) throw new MaterialIngestError("Network error while indexing. Try again.", { phase: "network", storageSaved: true });
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (!response) throw new MaterialIngestError("Network error while indexing. Try again.", { phase: "network", storageSaved: true });
    const data = (await response.json()) as IndexStepResponse;
    if (!response.ok) throw new MaterialIngestError(data.error ?? "Indexing failed.", { phase: "extract", status: response.status, storageSaved: true });
    if (data.done) return;
  }
  throw new MaterialIngestError("This file is too large to index in one go.", { phase: "extract", storageSaved: true });
}

/** Save text and index it; photographs also keep their single compressed image. */
export async function commitMaterialText(prepared: PreparedMaterial): Promise<string> {
  const { projectId, userId, materialId, storagePath, data } = prepared;
  let { textPath } = prepared;
  const type = data.type ?? prepared.type;
  const title = prepared.title.trim() || data.title?.trim() || "File";

  if (type !== "pdf") {
    await writeMaterialDoc(projectId, materialId, {
      userId,
      title: prepared.title,
      type: prepared.type,
      storagePath,
      textPath,
      originalName: prepared.originalName,
      originalMime: prepared.originalMime,
      originalSizeBytes: prepared.originalSizeBytes,
      storedMime: prepared.storedMime,
      extractedTextPreview: "",
      sizeBytes: prepared.sizeBytes,
      status: "processing",
    });
  }
  prepared.storageHeld = false;

  try {
    if (!data.type || (!data.text && !data.textStored && !data.indexed && type !== "image")) {
      throw new Error(data.error ?? "Extraction failed.");
    }

    if (type !== "pdf" && !data.textStored) {
      if (!data.text && type !== "image") throw new Error("Extraction failed.");
      textPath = await uploadExtractedText(textPath, data.text ?? "");
      prepared.textPath = textPath;
    }

    if (type === "pdf") {
      // The server already wrote pageCount, textChars, preview and status while indexing.
      return materialId;
    }

    // An uploaded image is its own preview; nothing else is rasterised or stored.
    const images: MaterialImage[] =
      type === "image" ? [{ page: 1, path: storagePath, mime: prepared.storedMime || "image/jpeg" }] : [];

    await writeMaterialDoc(projectId, materialId, {
      userId,
      title,
      type,
      storagePath,
      textPath,
      extractedTextPreview: previewFromPrepared(prepared),
      sizeBytes: prepared.sizeBytes,
      originalName: prepared.originalName,
      originalMime: prepared.originalMime,
      storedMime: prepared.storedMime,
      originalSizeBytes: prepared.originalSizeBytes,
      pageCount: data.pageCount ?? 1,
      hasImages: images.length > 0,
      textChars: data.textChars ?? data.text?.length ?? 0,
      images,
      status: "processing",
    });
    await indexMaterialText(projectId, materialId);
    await patchMaterialStatus(projectId, materialId, "ready");

    return materialId;
  } catch (error) {
    if (type === "pdf") {
      throw error instanceof MaterialIngestError
        ? error
        : new MaterialIngestError("PDF pages are saved; indexing can resume.", { phase: "extract", storageSaved: true });
    }
    await patchMaterialStatus(projectId, materialId, "failed");
    if (error instanceof MaterialIngestError) throw error;
    throw new MaterialIngestError("Saved, but text could not be read", {
      phase: "extract",
      storageSaved: true,
    });
  }
}

/** Write material docs and run the index. Parent project must exist (Firestore rules). */
export async function finalizeMaterialIngest(prepared: PreparedMaterial): Promise<string> {
  return commitMaterialText(prepared);
}

/** Compress photographs before Storage, then save extracted text and index it. */
export async function ingestMaterial(input: {
  projectId: string;
  userId: string;
  source: IngestSource;
  onProgress?: (progress: IngestProgress) => void;
}): Promise<string> {
  clearUntouchedNotebook(input.projectId);
  const prepared = await prepareMaterialIngest(input);
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
  title?: string;
  onProgress?: (progress: IngestProgress) => void;
}): Promise<string> {
  return ingestMaterial({
    projectId: input.projectId,
    userId: input.userId,
    source: { kind: "file", file: input.file, title: input.title },
    onProgress: input.onProgress,
  });
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

export function urlsInText(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<]+/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const url = raw.replace(/[),.;!?]+$/g, "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export { LARGE_PASTE_CHARS } from "@/lib/composer/paste-policy";
