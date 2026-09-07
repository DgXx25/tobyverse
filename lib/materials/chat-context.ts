import { CHAT_EXCERPT_CHARS, CHAT_MATERIAL_LIMIT, clipText } from "@/lib/materials/limits";
import { materialImageIndex } from "@/lib/materials/figures";
import { pickRelevantMaterials } from "@/lib/materials/relevance";
import { loadMaterialText } from "@/lib/materials/storage";
import type { ChatMaterialContext } from "@/types/chat";
import type { Material } from "@/types/material";

export async function excerptsForChat(
  query: string,
  materials: Material[],
): Promise<ChatMaterialContext[]> {
  const picked = pickRelevantMaterials(query, materials, CHAT_MATERIAL_LIMIT);
  const excerpts: ChatMaterialContext[] = [];

  for (const material of picked) {
    const text = await loadMaterialText(material);
    const index = materialImageIndex(material);
    const excerpt = clipText(index ? `${text}\n${index}` : text, CHAT_EXCERPT_CHARS);
    if (!excerpt) continue;
    excerpts.push({
      id: material.id,
      name: material.title,
      excerpt,
    });
  }

  return excerpts;
}
