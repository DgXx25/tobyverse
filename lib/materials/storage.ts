import { requireSignedInUser } from "@/lib/auth";
import { materialStoragePath } from "@/lib/firestore";
import { extForMime } from "@/lib/materials/types";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";

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

async function postStorageUpload(
  path: string,
  data: Blob | Uint8Array | string,
  contentType: string,
  options: { reservePool?: boolean; originalName?: string } = {},
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
  let response: Response;
  try {
    response = await fetch("/api/materials/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new StorageUploadError("Network error. Try again.", { kind: "network" });
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    path?: string;
    sizeBytes?: number;
    contentType?: string;
    reservedBytes?: number;
  };
  if (!response.ok) {
    const detail = body.error?.trim() || `Storage upload failed (${response.status}).`;
    throw new StorageUploadError(detail, { status: response.status });
  }
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
  options?: { reservePool?: boolean; originalName?: string },
): Promise<MaterialStorageUpload> {
  return postStorageUpload(path, data, contentType, options);
}

export async function uploadExtractedText(path: string, text: string) {
  await postStorageUpload(path, text, "text/plain; charset=utf-8");
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
