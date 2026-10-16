import { snapWikiThumbUrl, type ImageSearchHit } from "@/lib/images/types";
import type { ChatImageHit } from "@/types/chat";

/** Shared by the server tool, SSE reader, and image search client. */
export function toChatImageHit(hit: ImageSearchHit): ChatImageHit {
  const url = snapWikiThumbUrl(hit.url);
  const thumbnail = snapWikiThumbUrl(hit.thumbnail || hit.url);
  return {
    url, thumb: thumbnail || url, thumbnail: thumbnail || url,
    title: hit.alt, alt: hit.alt, source: hit.source,
    license: "", credit: "", kind: "web",
  };
}

export function parseSearchHits(value: unknown): ChatImageHit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    const thumbnail =
      (typeof row.thumbnail === "string" ? row.thumbnail.trim() : "") ||
      (typeof row.thumb === "string" ? row.thumb.trim() : "") || url;
    const alt =
      (typeof row.alt === "string" ? row.alt.trim() : "") ||
      (typeof row.title === "string" ? row.title.trim() : "");
    const source = typeof row.source === "string" ? row.source.trim() : "";
    if (!url || !/^https:\/\//i.test(url)) return [];
    return [toChatImageHit({ url, thumbnail: /^https:\/\//i.test(thumbnail) ? thumbnail : url, alt, source: source || "web" })];
  });
}
