import { CHAT_EXCERPT_CHARS, CHAT_MATERIAL_LIMIT, clipText } from "@/lib/materials/limits";
import { pickRelevantMaterials } from "@/lib/materials/relevance";
import type { ChatMaterialContext } from "@/types/chat";
import type { Material } from "@/types/material";

/** Legacy/non-page-indexed material previews; indexed PDFs are retrieved page-by-page in ProjectChat. */
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
