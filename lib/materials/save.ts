import { deleteMaterialDoc } from "@/lib/materials/store";
import { deleteStoragePath, extractedTextPath } from "@/lib/materials/storage";
import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { adjustStorageBytes } from "@/lib/account/store";
import type { Material } from "@/types/material";

export async function removeMaterial(material: Material): Promise<void> {
  const paths = new Set<string>([material.storagePath, material.textPath]);
  for (const image of material.images) paths.add(image.path);
  await Promise.all([...paths].map((path) => deleteStoragePath(path)));
  await deleteMaterialDoc(material.projectId, material.id);
  void adjustStorageBytes(material.userId, -material.sizeBytes);
}

export async function removeLibraryMaterial(item: {
  id: string;
  projectId: string;
  storagePath?: string;
  images?: { path: string }[];
  sizeBytes?: number;
}): Promise<void> {
  const paths = new Set<string>();
  if (item.storagePath) paths.add(item.storagePath);
  for (const image of item.images ?? []) {
    if (image.path) paths.add(image.path);
  }
  const parsed = item.storagePath ? parseMaterialStoragePath(item.storagePath) : null;
  if (parsed) {
    paths.add(extractedTextPath(parsed.userId, parsed.projectId, parsed.materialId));
  }
  await Promise.all([...paths].map((path) => deleteStoragePath(path)));
  await deleteMaterialDoc(item.projectId, item.id);
  const ownerId = parsed?.userId ?? "";
  if (ownerId && item.sizeBytes) void adjustStorageBytes(ownerId, -item.sizeBytes);
}
