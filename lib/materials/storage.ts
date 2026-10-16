import { requireSignedInUser } from "@/lib/auth";
import { materialStoragePath } from "@/lib/firestore";
import { extForMime } from "@/lib/materials/types";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { RESUMABLE_UPLOAD_THRESHOLD, sendUploadChunks } from "@/lib/materials/resumable-upload";

export class StorageUploadError extends Error {
  readonly status?: number;
  readonly kind?: "network";

  constructor(message: string, options?: { status?: number; kind?: "network" }) {
    super(message);
    this.name = "StorageUploadError";
    this.status = options?.status;
    this.kind = options?.kind;
  }
}

export function originalStoragePath(
  userId: string,
  projectId: string,
  materialId: string,
  fileName: string,
): string {
  return materialStoragePath(userId, projectId, materialId, fileName);
}

export function extractedTextPath(
  userId: string,
  projectId: string,
  materialId: string,
): string {
  return materialStoragePath(userId, projectId, materialId, "extracted.txt");
}

export function slideImagePath(
  userId: string,
  projectId: string,
  materialId: string,
  page: number,
  mime: string,
  index = 0,
): string {
  const ext = extForMime(mime);
  const name = index > 0 ? `slide-${page}-${index + 1}.${ext}` : `slide-${page}.${ext}`;
  return materialStoragePath(userId, projectId, materialId, name);
}

function asBlob(data: Blob | Uint8Array, contentType: string): Blob {
  if (data instanceof Blob) return data;
  return new Blob([new Uint8Array(data)], { type: contentType });
}

export type MaterialStorageUpload = { path: string; sizeBytes: number; contentType: string; reservedBytes: number };

type UploadSessionProgress = MaterialStorageUpload & { offset: number; done: boolean; error?: string };

function putUploadChunk(
  url: string,
  chunk: Blob,
  offset: number,
  token: string,
  onProgress: (loaded: number) => void,
): Promise<UploadSessionProgress> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("x-upload-offset", String(offset));
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onerror = () => reject(new StorageUploadError("Upload interrupted. Please retry the file.", { kind: "network" }));
    request.onload = () => {
      let body: UploadSessionProgress = { path: "", sizeBytes: 0, contentType: "", reservedBytes: 0, offset, done: false };
      try {
        body = JSON.parse(request.responseText) as UploadSessionProgress;
      } catch {
        // Keep the HTTP status as the useful error when the server response is not JSON.
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new StorageUploadError(body.error || `Upload failed (${request.status}).`, { status: request.status }));
        return;
      }
      resolve(body);
    };
    request.send(chunk);
  });
}

async function uploadInChunks(
  path: string,
  blob: Blob,
  contentType: string,
  token: string,
  reservePool: boolean,
  originalName?: string,
  onProgress?: (fraction: number) => void,
): Promise<MaterialStorageUpload> {
  const headers = { Authorization: `Bearer ${token}` };
  const init = await fetch("/api/materials/upload-session", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ path, sizeBytes: blob.size, contentType, reservePool, originalName }),
  });
  const started = await init.json() as { id?: string; error?: string };
  if (!init.ok || !started.id) throw new StorageUploadError(started.error || "Could not start upload.", { status: init.status });
  const url = `/api/materials/upload-session?id=${encodeURIComponent(started.id)}`;
  let result: MaterialStorageUpload | undefined;
  const progress = async (method: "PUT" | "GET", chunk?: Blob, offset?: number) => {
    let body: UploadSessionProgress;
    if (method === "PUT" && chunk && typeof offset === "number") {
      body = await putUploadChunk(url, chunk, offset, token, (loaded) => {
        if (blob.size > 0) onProgress?.(Math.min(1, (offset + loaded) / blob.size));
      });
    } else {
      const response = await fetch(url, { method, headers, cache: "no-store" });
      body = await response.json() as UploadSessionProgress;
      if (!response.ok) throw new StorageUploadError(body.error || `Upload failed (${response.status}).`, { status: response.status });
    }
    if (body.done) result = body;
    if (blob.size > 0) onProgress?.(Math.min(1, body.offset / blob.size));
    return { offset: body.offset, done: body.done };
  };
  try {
    await sendUploadChunks(blob, (chunk, offset) => progress("PUT", chunk, offset), () => progress("GET"));
    if (!result) throw new Error("Upload did not finish. Retry the file.");
    return result;
  } catch (error) {
    await fetch(url, { method: "DELETE", headers }).catch(() => undefined);
    if (error instanceof StorageUploadError) throw error;
    throw new StorageUploadError("Upload interrupted. Please retry the file.", { kind: "network" });
  }
}

async function postStorageUpload(
  path: string,
  data: Blob | Uint8Array | string,
  contentType: string,
  options: { reservePool?: boolean; originalName?: string; onProgress?: (fraction: number) => void } = {},
): Promise<MaterialStorageUpload> {
  const user = await requireSignedInUser();
  if (!user.uid) {
    throw new Error("Sign in required.");
  }
  if (!path.startsWith(`users/${user.uid}/`)) {
    throw new Error(`Storage path must be users/${user.uid}/projects/.../materials/... (got ${path}).`);
  }

  const blob =
    typeof data === "string" ? new Blob([data], { type: contentType }) : asBlob(data, contentType);

  const token = await user.getIdToken();
  if (!token) {
    throw new Error("Storage upload failed: signed in, but getIdToken() returned no token.");
  }
  if (blob.size > RESUMABLE_UPLOAD_THRESHOLD) {
    return uploadInChunks(path, blob, contentType, token, options.reservePool === true, options.originalName, options.onProgress);
  }
  const form = new FormData();
  form.set("path", path);
  form.set("contentType", contentType);
  if (options.reservePool) form.set("reservePool", "true");
  if (typeof data === "string") {
    form.set("text", data);
  } else {
    const filename = encodeURIComponent(path.split("/").pop() || "file");
    form.set("file", blob, filename);
    form.set("fileName", options.originalName || filename);
  }
  const body = await new Promise<{
    error?: string;
    path?: string;
    sizeBytes?: number;
    contentType?: string;
    reservedBytes?: number;
  }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/materials/upload");
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(new StorageUploadError("Network error. Try again.", { kind: "network" }));
    request.onload = () => {
      let payload: { error?: string; path?: string; sizeBytes?: number; contentType?: string; reservedBytes?: number } = {};
      try {
        payload = JSON.parse(request.responseText) as typeof payload;
      } catch {
        // Keep the HTTP status as the useful error when the server response is not JSON.
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new StorageUploadError(payload.error?.trim() || `Storage upload failed (${request.status}).`, { status: request.status }));
        return;
      }
      options.onProgress?.(1);
      resolve(payload);
    };
    request.send(form);
  });
  return {
    path: body.path || path,
    sizeBytes: Number.isFinite(body.sizeBytes) ? Number(body.sizeBytes) : (typeof data === "string" ? new TextEncoder().encode(data).byteLength : blob.size),
    contentType: body.contentType || contentType,
    reservedBytes: Number.isFinite(body.reservedBytes) ? Number(body.reservedBytes) : 0,
  };
}

export function pdfPageTextPath(userId: string, projectId: string, materialId: string, page: number): string {
  return materialStoragePath(userId, projectId, materialId, `pages/${String(page).padStart(4, "0")}.txt`);
}

export function pdfPageImagePath(userId: string, projectId: string, materialId: string, page: number): string {
  return materialStoragePath(userId, projectId, materialId, `page-${page}.png`);
}

export async function uploadMaterialBytes(
  path: string,
  data: Blob | Uint8Array,
  contentType: string,
  options?: { reservePool?: boolean; originalName?: string; onProgress?: (fraction: number) => void },
): Promise<MaterialStorageUpload> {
  return postStorageUpload(path, data, contentType, options);
}

export async function uploadExtractedText(path: string, text: string) {
  const uploaded = await postStorageUpload(path, text, "text/plain; charset=utf-8");
  return uploaded.path;
}

export async function releaseStoragePool(bytes: number): Promise<void> {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const user = await requireSignedInUser();
  const token = await user.getIdToken();
  const response = await fetch("/api/materials/upload", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ releaseBytes: Math.ceil(bytes) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error?.trim() || "Could not release material storage.");
  }
}

const missingMaterialFiles = new Set<string>();

export function isMissingMaterialFile(path: string): boolean {
  return missingMaterialFiles.has(path);
}

function markMissingMaterialFile(path: string) {
  missingMaterialFiles.add(path);
}

async function fetchMaterialFile(path: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (missingMaterialFiles.has(path)) {
    throw new Error("File not found.");
  }
  const user = await requireSignedInUser();
  const parsed = parseMaterialStoragePath(path);
  if (!parsed || parsed.userId !== user.uid) {
    throw new Error("Invalid storage path.");
  }
  const token = await user.getIdToken();
  const query = new URLSearchParams({
    projectId: parsed.projectId,
    materialId: parsed.materialId,
    name: parsed.name,
  });
  let response: Response;
  try {
    response = await fetch(`/api/materials/file?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Could not read file.");
  }
  if (!response.ok) {
    if (response.status === 404) markMissingMaterialFile(path);
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error?.trim() || `Could not read file (${response.status}).`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function readExtractedText(path: string): Promise<string> {
  const { bytes } = await fetchMaterialFile(path);
  return new TextDecoder().decode(bytes);
}

export async function readStorageBytes(path: string): Promise<Uint8Array> {
  const { bytes } = await fetchMaterialFile(path);
  return bytes;
}

export async function storageDownloadUrl(path: string): Promise<string> {
  const { bytes, contentType } = await fetchMaterialFile(path);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return URL.createObjectURL(new Blob([copy], { type: contentType }));
}

export async function loadMaterialText(material: {
  textPath: string;
  extractedTextPreview: string;
}): Promise<string> {
  try {
    const text = await readExtractedText(material.textPath);
    if (text.trim()) return text;
  } catch {
    // Sidecar missing — fall back to the compact preview only.
  }
  return material.extractedTextPreview;
}

export async function deleteStoragePath(path: string): Promise<void> {
  if (!path) return;
  try {
    const user = await requireSignedInUser();
    if (!path.startsWith(`users/${user.uid}/`)) return;
    const token = await user.getIdToken();
    await fetch("/api/materials/upload", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    });
  } catch {
    // Best-effort cleanup after a failed ingest.
  }
}
