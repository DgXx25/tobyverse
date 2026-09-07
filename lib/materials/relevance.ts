import type { Material } from "@/types/material";
import { CHAT_EXCERPT_CHARS, clipText } from "@/lib/materials/limits";

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2);
}

export function scoreMaterial(query: string, material: Material): number {
  const haystack = `${material.title} ${material.extractedTextPreview}`.toLowerCase();
  const words = new Set(tokens(query));
  if (words.size === 0) return 1;
  let hits = 0;
  for (const word of words) {
    if (haystack.includes(word)) hits += 1;
  }
  return hits / words.size;
}

export function pickRelevantMaterials(query: string, materials: Material[], limit: number): Material[] {
  return [...materials]
    .map((material) => ({ material, score: scoreMaterial(query, material) }))
    .sort(
      (a, b) =>
        b.score - a.score || (b.material.createdAt ?? "").localeCompare(a.material.createdAt ?? ""),
    )
    .slice(0, limit)
    .map((item) => item.material);
}

export function toChatExcerpt(title: string, text: string): { name: string; excerpt: string } {
  return {
    name: title,
    excerpt: clipText(text, CHAT_EXCERPT_CHARS),
  };
}
