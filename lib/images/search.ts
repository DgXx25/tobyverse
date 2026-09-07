export type ImageSearchHit = {
  url: string;
  title: string;
  source: string;
  pageUrl?: string;
  thumb?: string;
};

export class ImageSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageSearchError";
  }
}

function searchConfig() {
  const cx = (process.env.GOOGLE_CSE_ID ?? process.env.GOOGLE_SEARCH_ENGINE_ID ?? "").trim();
  const key = (process.env.GOOGLE_CSE_API_KEY ?? "").trim();
  return { cx, key };
}

export function imageSearchConfigured(): boolean {
  const { cx, key } = searchConfig();
  return Boolean(cx && key);
}

export async function searchWebImages(query: string): Promise<ImageSearchHit[]> {
  const q = query.trim();
  if (!q) throw new ImageSearchError("Missing search query.");
  const { cx, key } = searchConfig();
  if (!cx || !key) {
    throw new ImageSearchError("Image search is not configured (need GOOGLE_CSE_ID and GOOGLE_CSE_API_KEY).");
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", q);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", "8");
  url.searchParams.set("safe", "active");

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as {
    error?: { message?: string };
    items?: Array<{
      title?: unknown;
      link?: unknown;
      displayLink?: unknown;
      image?: { thumbnailLink?: unknown; contextLink?: unknown };
    }>;
  };

  if (!response.ok) {
    throw new ImageSearchError(data.error?.message?.trim() || "Image search failed.");
  }

  const hits = (data.items ?? []).flatMap((item) => {
    const imageUrl = typeof item.link === "string" ? item.link.trim() : "";
    if (!imageUrl) return [];
    const title = typeof item.title === "string" ? item.title.trim() : q;
    const source = typeof item.displayLink === "string" ? item.displayLink.trim() : "web";
    const pageUrl = typeof item.image?.contextLink === "string" ? item.image.contextLink.trim() : undefined;
    const thumb = typeof item.image?.thumbnailLink === "string" ? item.image.thumbnailLink.trim() : undefined;
    return [{ url: imageUrl, title: title || q, source: source || "web", pageUrl, thumb }];
  });

  return hits.slice(0, 8);
}
