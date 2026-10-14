import { storedObjectName, parseMaterialStoragePath } from "@/lib/materials/storage-path";
import type { Material } from "@/types/material";

/** Sidecars belong to their source material, never to the user's file grid. */
export function originalLibraryMaterials(materials: Material[]): Material[] {
  const derived = new Set<string>();
  for (const material of materials) {
    for (const path of [material.textPath, material.extractedPath, material.previewPagePath, ...material.images.map((image) => image.path)]) {
      if (path && path !== material.storagePath) derived.add(path);
    }
  }
  return materials.filter((material) => {
    if (material.type === "paste" || material.type === "url") return false;
    const name = storedObjectName(material.storagePath);
    if (!name || name.toLowerCase() === "extracted.txt" || derived.has(material.storagePath)) return false;
    const owner = parseMaterialStoragePath(material.storagePath);
    if (owner && owner.materialId !== material.id) return false;
    return true;
  });
}
