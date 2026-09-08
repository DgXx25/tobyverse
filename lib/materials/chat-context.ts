import { CHAT_EXCERPT_CHARS, CHAT_MATERIAL_LIMIT, clipText } from "@/lib/materials/limits";
import { pickRelevantMaterials } from "@/lib/materials/relevance";
import type { ChatMaterialContext } from "@/types/chat";
import type { Material } from "@/types/material";

/** In-memory excerpts only. Chat send must not GET extracted.txt or slide images. */
export function excerptsForChat(query: string, materials: Material[]): ChatMaterialContext[] {
  const picked = pickRelevantMaterials(query, materials, CHAT_MATERIAL_LIMIT);
  const excerpts: ChatMaterialContext[] = [];

  for (const material of picked) {
    const excerpt = clipText(material.extractedTextPreview, CHAT_EXCERPT_CHARS);
    if (!excerpt) continue;
    excerpts.push({
      id: material.id,
      name: material.title,
      excerpt,
    });
  }

  return excerpts;
}
