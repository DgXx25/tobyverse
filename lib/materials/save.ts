import { authHeaders } from "@/lib/api/client";
import { deleteMaterialDoc } from "@/lib/materials/store";
import { deleteStoragePath, extractedTextPath, releaseStoragePool } from "@/lib/materials/storage";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import type { Material } from "@/types/material";

/** Vector chunks live server-side only, so removal goes through the API. Best effort: never blocks deletion. */
export async function dropMaterialIndex(projectId: string, materialId: string): Promise<void> {
  try {
    await fetch("/api/materials/delete", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ projectId, materialId }),
    });
  } catch {
    /* orphaned chunks are invisible to retrieval once the material doc is gone */
  }
}

export async function removeMaterial(material: Material): Promise<void> {
  const paths = new Set<string>([material.storagePath, material.textPath]);
  if (material.originalStoragePath) paths.add(material.originalStoragePath);
  for (const image of material.images) paths.add(image.path);
  await Promise.all([
    ...[...paths].map((path) => deleteStoragePath(path)),
    dropMaterialIndex(material.projectId, material.id),
  ]);
  await deleteMaterialDoc(material.projectId, material.id);
  void releaseStoragePool(material.sizeBytes).catch(() => undefined);
}

export async function removeLibraryMaterial(item: {
  id: string;
  projectId: string;
  storagePath?: string;
  originalStoragePath?: string;
  images?: { path: string }[];
  sizeBytes?: number;
}): Promise<void> {
  const paths = new Set<string>();
  if (item.storagePath) paths.add(item.storagePath);
  if (item.originalStoragePath) paths.add(item.originalStoragePath);
  for (const image of item.images ?? []) {
    if (image.path) paths.add(image.path);
  }
  const parsed = item.storagePath ? parseMaterialStoragePath(item.storagePath) : null;
  if (parsed) {
    paths.add(extractedTextPath(parsed.userId, parsed.projectId, parsed.materialId));
  }
  await Promise.all([
    ...[...paths].map((path) => deleteStoragePath(path)),
    dropMaterialIndex(item.projectId, item.id),
  ]);
  await deleteMaterialDoc(item.projectId, item.id);
  const ownerId = parsed?.userId ?? "";
  if (ownerId && item.sizeBytes) void releaseStoragePool(item.sizeBytes).catch(() => undefined);
}
