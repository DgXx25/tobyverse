import { isImageAttachment } from "@/lib/composer/attach";
import { scoreMaterial } from "@/lib/materials/relevance";
import type { ChatAttachment, ChatImageHit } from "@/types/chat";
import type { Material } from "@/types/material";

const MAX = 8;

function uploadHit(input: {
  title: string;
  materialId?: string;
  storagePath?: string;
}): ChatImageHit | null {
  const storagePath = input.storagePath?.trim();
  if (!storagePath) return null;
  return {
    url: storagePath,
    thumb: storagePath,
    title: input.title.trim() || "Upload",
    source: "upload",
    license: "",
    credit: "",
    kind: "upload",
    materialId: input.materialId,
    storagePath,
  };
}

export function localImageHits(input: {
  query: string;
  materials: Material[];
  attachments?: ChatAttachment[];
  limit?: number;
}): ChatImageHit[] {
  const limit = input.limit ?? MAX;
  const hits: ChatImageHit[] = [];
  const seen = new Set<string>();

  function push(hit: ChatImageHit | null) {
    if (!hit || hits.length >= limit) return;
    const key = hit.storagePath || hit.materialId || hit.url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  }

  for (const item of input.attachments ?? []) {
    if (!isImageAttachment(item.type, item.title)) continue;
    const material = input.materials.find((row) => row.id === item.materialId);
    const storagePath = item.storagePath || material?.storagePath || material?.images[0]?.path;
    push(uploadHit({ title: item.title, materialId: item.materialId || material?.id, storagePath }));
  }

  if (hits.length >= limit) return hits;

  const ranked = [...input.materials]
    .filter((material) => material.type === "image" || material.images.length > 0)
    .map((material) => ({ material, score: scoreMaterial(input.query, material) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const row of ranked) {
    const material = row.material;
    const storagePath = material.storagePath || material.images[0]?.path;
    push(uploadHit({ title: material.title, materialId: material.id, storagePath }));
    if (hits.length >= limit) break;
  }

  return hits;
}
