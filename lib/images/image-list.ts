import { imageListSchema, type ImageListBlock } from "@/lib/blocks/kinds/image-list";
import { parsePartialObject } from "@/lib/ai/json-stream";
import type { ChatImageHit } from "@/types/chat";

export function resolveImageListItems(block: ImageListBlock, images: ChatImageHit[]) {
  return block.items.map((item) => {
    const candidates = item.galleryId ? images.filter((image) => image.galleryId === item.galleryId) : images;
    return { ...item, image: candidates[item.imageIndex] };
  });
}

/** Only actual result objects can consume a gallery thumbnail; generated URLs are never read. */
export function imageListFromFence(lang: string, body: string): ImageListBlock | null {
  let raw = body.trim();
  if (lang === "toby") {
    if (/^image-list\s*\n/i.test(raw)) raw = raw.replace(/^image-list\s*\n/i, "");
    else if (!/^\{/.test(raw)) return null;
  } else if (lang !== "toby-image-list") return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { value = parsePartialObject(raw); }
  if (lang === "toby" && body.trim().startsWith("{") && (value as { type?: unknown } | null)?.type !== "image-list") return null;
  const parsed = imageListSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function publicImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
