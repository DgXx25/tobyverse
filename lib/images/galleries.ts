import type { ChatImageHit } from "@/types/chat";
import { imageListFromFence, resolveImageListItems } from "./image-list";
import { parseTobyFence } from "@/lib/blocks/registry";
import type { VisualExplanationBlock } from "@/lib/blocks/kinds/visual-explanation";

type ContentPart = { kind: "md"; text: string } | { kind: "fence"; lang: string; text: string };
export type ImageGalleryPart = { kind: "gallery"; galleryId: string; images: ChatImageHit[] };

export function imageGalleryId(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(value) ? value : undefined;
}

function contentFences(text: string): ContentPart[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const parts: ContentPart[] = [];
  let start = 0;
  for (let index = 0; index < lines.length; index++) {
    // Only top-level fences are placements; examples inside quotes or longer fences stay code.
    const open = lines[index].match(/^ {0,3}(`{3,}|~{3,})([\w-]*)[ \t]*(.*)$/);
    if (!open) continue;
    if (index > start) parts.push({ kind: "md", text: lines.slice(start, index).join("\n") + "\n" });
    const inlineClose = open[3].indexOf(open[1]);
    if (inlineClose >= 0) {
      parts.push({ kind: "fence", lang: open[2].toLowerCase(), text: open[3].slice(0, inlineClose) });
      const after = open[3].slice(inlineClose + open[1].length);
      if (after) parts.push({ kind: "md", text: after });
      start = index + 1;
      continue;
    }
    const close = new RegExp(`^ {0,3}${open[1][0]}{${open[1].length},}[ \\t]*$`);
    let end = index + 1;
    while (end < lines.length && !close.test(lines[end])) end++;
    const body = [...(open[3] ? [open[3]] : []), ...lines.slice(index + 1, end)].join("\n");
    parts.push({ kind: "fence", lang: open[2].toLowerCase(), text: body });
    index = end;
    start = Math.min(end + 1, lines.length);
  }
  if (start < lines.length) parts.push({ kind: "md", text: lines.slice(start).join("\n") });
  return parts;
}

/** Resolve optional placement fences against this message's actual search results only. */
export function layoutImageGalleries(text: string, images: ChatImageHit[] = []): {
  segments: Array<ContentPart | ImageGalleryPart>;
  remaining: ChatImageHit[];
} {
  const used = new Set<ChatImageHit>();
  const visualGalleryIds = new Set<string>();
  const segments = contentFences(text).flatMap((part): Array<ContentPart | ImageGalleryPart> => {
    if (part.kind === "fence") {
      const list = imageListFromFence(part.lang, part.text);
      if (list) {
        for (const item of resolveImageListItems(list, images)) if (item.image) used.add(item.image);
        return [part];
      }
      if (part.lang === "toby" || part.lang.startsWith("toby-")) {
        const visual = parseTobyFence(part.lang, part.text);
        if (visual?.type === "visual-explanation") {
          const block = visual.data as VisualExplanationBlock;
          const candidates = block.galleryId ? images.filter((image) => image.galleryId === block.galleryId) : images;
          const image = candidates[block.imageIndex];
          if (image) {
            used.add(image);
            if (block.galleryId) visualGalleryIds.add(block.galleryId);
          }
        }
        return [part];
      }
    }
    if (part.kind !== "fence" || part.lang !== "image-gallery") return [part];
    let galleryId: string | undefined;
    try {
      galleryId = imageGalleryId(JSON.parse(part.text)?.galleryId);
    } catch {
      // A partial streaming fence becomes visible once its reference is complete.
    }
    if (!galleryId) return [];
    const matches = images.filter((image) => image.galleryId === galleryId && !used.has(image));
    if (!matches.length) return [];
    matches.forEach((image) => used.add(image));
    return [{ kind: "gallery", galleryId, images: matches }];
  });
  return {
    segments,
    // A visual-explanation intentionally chooses one image from a search set;
    // keep its unused siblings from reappearing as a second, detached gallery.
    remaining: images.filter((image) => !used.has(image) && !visualGalleryIds.has(image.galleryId ?? "")),
  };
}
