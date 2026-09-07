import { deleteMaterialDoc } from "@/lib/materials/store";
import { deleteStoragePath } from "@/lib/materials/storage";
import type { Material } from "@/types/material";

export async function removeMaterial(material: Material): Promise<void> {
  const paths = new Set<string>([material.storagePath, material.textPath]);
  for (const image of material.images) paths.add(image.path);
  await Promise.all([...paths].map((path) => deleteStoragePath(path)));
  await deleteMaterialDoc(material.projectId, material.id);
}
