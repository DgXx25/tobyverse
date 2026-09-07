import { clipText, SHEET_EXCERPT_CHARS, SHEET_TOTAL_CHARS } from "@/lib/materials/limits";
import { loadMaterialText } from "@/lib/materials/storage";
import { chatContextExcerpt } from "@/lib/chat/excerpt";
import type { Material } from "@/types/material";

export type SourceExcerpt = {
  title: string;
  excerpt: string;
  images?: { slide: number; path: string }[];
};

export async function collectProjectSources(input: {
  projectId: string;
  materials: Material[];
  prompt?: string;
}): Promise<SourceExcerpt[]> {
  const excerpts: SourceExcerpt[] = [];
  let used = 0;

  if (input.prompt?.trim()) {
    const excerpt = clipText(input.prompt, SHEET_EXCERPT_CHARS);
    if (excerpt) {
      excerpts.push({ title: "Current request", excerpt });
      used += excerpt.length;
    }
  }

  for (const material of input.materials) {
    if (used >= SHEET_TOTAL_CHARS) break;
    const text = await loadMaterialText(material);
    const excerpt = clipText(text, SHEET_EXCERPT_CHARS);
    if (!excerpt && material.images.length === 0) continue;
    used += excerpt.length;
    excerpts.push({
      title: material.title,
      excerpt,
      images: material.images.map((item) => ({ slide: item.page, path: item.path })),
    });
  }

  if (used < SHEET_TOTAL_CHARS) {
    const chat = await chatContextExcerpt(input.projectId, SHEET_EXCERPT_CHARS);
    if (chat) excerpts.push(chat);
  }

  return excerpts;
}

export function formatSourceBlock(item: SourceExcerpt): string {
  const images = (item.images ?? [])
    .slice(0, 16)
    .map((image) => `- slide ${image.slide}: ${image.path}`)
    .join("\n");
  return [`# ${item.title}`, item.excerpt, images ? `Images (cite path exactly, do not invent):\n${images}` : null]
    .filter(Boolean)
    .join("\n");
}
