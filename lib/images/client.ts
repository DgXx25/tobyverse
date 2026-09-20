import { authHeaders } from "@/lib/api/client";
import { IMAGE_SEARCH_DEFAULT, type ImageSearchHit, snapWikiThumbUrl } from "@/lib/images/types";
import type { ChatImageHit } from "@/types/chat";

export class ImageSearchRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ImageSearchRequestError";
    this.status = status;
  }
}

export function toChatImageHit(hit: ImageSearchHit): ChatImageHit {
  const url = snapWikiThumbUrl(hit.url);
  const thumbnail = snapWikiThumbUrl(hit.thumbnail || hit.url);
  return {
    url,
    thumb: thumbnail || url,
    thumbnail: thumbnail || url,
    title: hit.alt,
    alt: hit.alt,
    source: hit.source,
    license: "",
    credit: "",
    kind: "web",
  };
}

/** Public search URLs only — never uploads or stored files. */
export function toImageAttach(hit: ChatImageHit): ImageSearchHit | null {
  if (hit.kind === "upload" || hit.storagePath) return null;
  const url = (hit.url || "").trim();
  if (!/^https:\/\//i.test(url)) return null;
  const thumbnail = (hit.thumbnail || hit.thumb || url).trim();
  return {
    url,
    thumbnail: /^https:\/\//i.test(thumbnail) ? thumbnail : url,
    alt: (hit.alt || hit.title || "").trim(),
    source: (hit.source || "").trim() || "web",
  };
}

function parseSearchHits(value: unknown): ChatImageHit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    const thumbnail =
      (typeof row.thumbnail === "string" ? row.thumbnail.trim() : "") ||
      (typeof row.thumb === "string" ? row.thumb.trim() : "") ||
      url;
    const alt =
      (typeof row.alt === "string" ? row.alt.trim() : "") ||
      (typeof row.title === "string" ? row.title.trim() : "");
    const source = typeof row.source === "string" ? row.source.trim() : "";
    if (!url || !/^https:\/\//i.test(url)) return [];
    return [
      toChatImageHit({
        url,
        thumbnail: /^https:\/\//i.test(thumbnail) ? thumbnail : url,
        alt,
        source: source || "web",
      }),
    ];
  });
}

export async function searchImagesClient(query: string, count = IMAGE_SEARCH_DEFAULT): Promise<ChatImageHit[]> {
  let response: Response;
  try {
    response = await fetch("/api/images/search", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ query, count }),
    });
  } catch {
    throw new ImageSearchRequestError("Could not reach image search.", 0);
  }
  const data = (await response.json().catch(() => ({}))) as { images?: unknown; error?: string };
  if (!response.ok) {
    throw new ImageSearchRequestError(
      data.error?.trim() || (response.status === 401 ? "Sign in." : "Image search failed."),
      response.status,
    );
  }
  return parseSearchHits(data.images);
}
