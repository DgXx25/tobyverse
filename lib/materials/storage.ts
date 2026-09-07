import { deleteObject, ref } from "firebase/storage";
import { getFirebaseStorage } from "@/lib/firebase";
import { requireSignedInUser } from "@/lib/auth";
import { materialStoragePath } from "@/lib/firestore";
import { extForMime } from "@/lib/materials/types";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";

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

async function postStorageUpload(path: string, data: Blob | Uint8Array | string, contentType: string): Promise<void> {
  const user = await requireSignedInUser();
  const token = await user.getIdToken();
  const hasToken = typeof token === "string" && token.length > 0;

  if (!user.uid) {
    throw new Error("Sign in required.");
  }
  if (!hasToken) {
    throw new Error("Storage upload failed: signed in, but getIdToken() returned no token.");
  }
  if (!path.startsWith(`users/${user.uid}/`)) {
    throw new Error(`Storage path must be users/${user.uid}/projects/.../materials/... (got ${path}).`);
  }

  const form = new FormData();
  form.set("path", path);
  form.set("contentType", contentType);
  if (typeof data === "string") {
    form.set("text", data);
  } else {
    form.set("file", asBlob(data, contentType), path.split("/").pop() || "file");
  }

  let response: Response;
  try {
    response = await fetch("/api/materials/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new Error("Upload failed.");
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    const detail = body.error?.trim() || `Storage upload failed (${response.status}).`;
    throw new Error(detail);
  }
}

export async function uploadMaterialBytes(path: string, data: Blob | Uint8Array, contentType: string) {
  await postStorageUpload(path, data, contentType);
}

export async function uploadExtractedText(path: string, text: string) {
  await postStorageUpload(path, text, "text/plain; charset=utf-8");
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
  await deleteObject(ref(getFirebaseStorage(), path)).catch(() => undefined);
}
