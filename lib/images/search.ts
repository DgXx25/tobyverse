import { expandEnglishImageQuery, pickImageHits, planImageSearch, type ImageSearchPlan } from "@/lib/images/query";
import {
  IMAGE_PREVIEW_WIDTH,
  IMAGE_SEARCH_DEFAULT,
  IMAGE_SEARCH_MAX,
  IMAGE_THUMB_WIDTH,
  snapWikiThumbUrl,
  type ImageSearchHit,
} from "@/lib/images/types";

export type { ImageSearchHit } from "@/lib/images/types";
export { IMAGE_SEARCH_DEFAULT, IMAGE_SEARCH_MAX } from "@/lib/images/types";

export class ImageSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageSearchError";
  }
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 200;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const FETCH_MS = 8000;
const GOOGLE_MS = 4000;
const UA = "Tobyverse/1.0 (study app; image search)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type CacheEntry = { at: number; hits: ImageSearchHit[] };

const memoryCache = new Map<string, CacheEntry>();
const rateStamps = new Map<string, number[]>();

function pexelsKey(): string {
  return (process.env.PEXELS_API_KEY ?? "").trim();
}

function pixabayKey(): string {
  return (process.env.PIXABAY_API_KEY ?? "").trim();
}

/** Always on: Wikimedia + Openverse need no keys. */
export function imageSearchConfigured(): boolean {
  return true;
}

export function clampImageCount(count?: number): number {
  if (!Number.isFinite(count)) return IMAGE_SEARCH_DEFAULT;
  return Math.min(IMAGE_SEARCH_MAX, Math.max(1, Math.floor(count as number)));
}

export function normalizeImageQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function allowImageSearch(uid: string): boolean {
  const id = uid.trim();
  if (!id) return false;
  const now = Date.now();
  const stamps = (rateStamps.get(id) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (stamps.length >= RATE_MAX) {
    rateStamps.set(id, stamps);
    return false;
  }
  stamps.push(now);
  rateStamps.set(id, stamps);
  return true;
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("utm_content");
    return parsed.toString();
  } catch {
    return url;
  }
}

function wikiFileName(title: string, url: string): string {
  const fromTitle = title.replace(/^File:/i, "").trim();
  if (fromTitle) return fromTitle.replace(/ /g, "_");
  try {
    const file = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return file.replace(/ /g, "_");
  } catch {
    return "";
  }
}

function wikiThumbUrl(file: string, width: number): string {
  return `https://commons.wikimedia.org/w/thumb.php?f=${encodeURIComponent(file)}&width=${width}`;
}

function sizedWikiThumb(apiThumb: string, width: number): string {
  const snapped = snapWikiThumbUrl(`/${width}px-`);
  const step = snapped.match(/\/(\d+)px-/)?.[1] ?? String(width);
  const resized = apiThumb.replace(/\/\d+px-/, `/${step}px-`);
  return isHttps(resized) ? resized : "";
}

function asHit(input: { url?: string; thumbnail?: string; alt?: string; source: string; fallbackAlt: string }): ImageSearchHit | null {
  const original = cleanUrl((input.url || "").trim());
  const rawThumb = cleanUrl((input.thumbnail || "").trim() || original);
  if (!isHttps(original) && !isHttps(rawThumb)) return null;
  const raster = (url: string, fallback: string) => (/\.svg(\?|#|$)/i.test(url) ? fallback || url : url);
  const thumbnail = raster(isHttps(rawThumb) ? rawThumb : original, original);
  const url = raster(isHttps(original) ? original : thumbnail, thumbnail);
  if (!isHttps(url) || !isHttps(thumbnail)) return null;
  if (/\.svg(\?|#|$)/i.test(url) || /\.svg(\?|#|$)/i.test(thumbnail)) return null;
  return {
    url: snapWikiThumbUrl(url),
    thumbnail: snapWikiThumbUrl(thumbnail),
    alt: (input.alt || "").trim() || input.fallbackAlt,
    source: input.source,
  };
}

function pruneCache(now: number) {
  if (memoryCache.size <= CACHE_MAX) return;
  for (const [key, entry] of memoryCache) {
    if (now - entry.at >= CACHE_TTL_MS) memoryCache.delete(key);
  }
  if (memoryCache.size <= CACHE_MAX) return;
  const extra = memoryCache.size - CACHE_MAX;
  let dropped = 0;
  for (const key of memoryCache.keys()) {
    memoryCache.delete(key);
    dropped += 1;
    if (dropped >= extra) break;
  }
}

function readCache(key: string): ImageSearchHit[] | null {
  const now = Date.now();
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (now - entry.at >= CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return entry.hits.map((hit) => ({ ...hit }));
}

function writeCache(key: string, hits: ImageSearchHit[]) {
  memoryCache.set(key, { at: Date.now(), hits: hits.map((hit) => ({ ...hit })) });
  pruneCache(Date.now());
}

function mergeHits(base: ImageSearchHit[], extra: ImageSearchHit[], limit: number): ImageSearchHit[] {
  const out = [...base];
  const seen = new Set(base.map((hit) => hit.url));
  for (const hit of extra) {
    if (!hit.url || seen.has(hit.url)) continue;
    seen.add(hit.url);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

type FetchJson = { ok: true; data: unknown } | { ok: false };

async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = FETCH_MS): Promise<FetchJson> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": UA, ...headers },
    });
    if (!response.ok) return { ok: false };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

type ProviderHits = { hits: ImageSearchHit[]; ok: boolean };

async function searchWikimedia(query: string, count: number): Promise<ProviderHits> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(count));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime");
  url.searchParams.set("iiurlwidth", String(IMAGE_PREVIEW_WIDTH));
  const fetched = await fetchJson(url.toString());
  if (!fetched.ok) return { hits: [], ok: false };
  const data = fetched.data as {
    query?: {
      pages?: Array<{
        title?: unknown;
        imageinfo?: Array<{ url?: unknown; thumburl?: unknown; mime?: unknown }>;
      }>;
    };
  };
  const pages = data?.query?.pages ?? [];
  return {
    ok: true,
    hits: pages.flatMap((page) => {
      const info = page.imageinfo?.[0];
      const mime = typeof info?.mime === "string" ? info.mime : "";
      if (mime && !mime.startsWith("image/")) return [];
      const title = typeof page.title === "string" ? page.title.replace(/^File:/i, "") : "";
      const original = typeof info?.url === "string" ? info.url : "";
      const apiThumb = typeof info?.thumburl === "string" ? info.thumburl : "";
      const file = wikiFileName(title, original);
      if (!file) return [];
      const preview = apiThumb || wikiThumbUrl(file, IMAGE_PREVIEW_WIDTH);
      const thumbnail =
        sizedWikiThumb(apiThumb, IMAGE_THUMB_WIDTH) || wikiThumbUrl(file, IMAGE_THUMB_WIDTH);
      const hit = asHit({
        url: preview || thumbnail,
        thumbnail: thumbnail || preview,
        alt: title,
        source: "wikimedia",
        fallbackAlt: query,
      });
      return hit ? [hit] : [];
    }),
  };
}

async function searchOpenverse(query: string, count: number): Promise<ProviderHits> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(count));
  url.searchParams.set("mature", "false");
  const fetched = await fetchJson(url.toString());
  if (!fetched.ok) return { hits: [], ok: false };
  const data = fetched.data as {
    results?: Array<{ title?: unknown; url?: unknown; thumbnail?: unknown }>;
  };
  if (!data?.results) return { hits: [], ok: true };
  return {
    ok: true,
    hits: data.results.flatMap((item) => {
      const imageUrl = typeof item.url === "string" ? item.url : "";
      const thumb = typeof item.thumbnail === "string" ? item.thumbnail : "";
      const hit = asHit({
        url: thumb || imageUrl,
        thumbnail: thumb || imageUrl,
        alt: typeof item.title === "string" ? item.title : "",
        source: "openverse",
        fallbackAlt: query,
      });
      return hit ? [hit] : [];
    }),
  };
}

/** Port of Techblogogy/free-google-image-search, without the dead CORS proxy. Often blocked by Google. */
async function searchGoogleImages(query: string, count: number): Promise<ProviderHits> {
  const url =
    "https://www.google.com/search?source=lnms&sa=X&gbv=1&tbm=isch&safe=active&q=" + encodeURIComponent(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": BROWSER_UA,
        Cookie: "CONSENT=YES+",
      },
    });
    if (!response.ok) return { hits: [], ok: false };
    const html = await response.text();
    const hits: ImageSearchHit[] = [];
    const seen = new Set<string>();
    const pattern = /<img[^>]+src="(https:[^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const src = match[1] ?? "";
      if (!src || seen.has(src)) continue;
      if (/gstatic|google\.com\/images|logo|sprite|favicon|data:/i.test(src)) continue;
      const hit = asHit({ url: src, thumbnail: src, alt: query, source: "google", fallbackAlt: query });
      if (!hit) continue;
      seen.add(src);
      hits.push(hit);
      if (hits.length >= count) break;
    }
    return { hits, ok: true };
  } catch {
    return { hits: [], ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function searchPexels(query: string, count: number): Promise<ProviderHits> {
  const key = pexelsKey();
  if (!key) return { hits: [], ok: true };
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(count));
  const fetched = await fetchJson(url.toString(), { Authorization: key });
  if (!fetched.ok) return { hits: [], ok: false };
  const data = fetched.data as {
    photos?: Array<{
      alt?: unknown;
      src?: { large?: unknown; original?: unknown; medium?: unknown; tiny?: unknown };
    }>;
  };
  if (!data?.photos) return { hits: [], ok: true };
  return {
    ok: true,
    hits: data.photos.flatMap((photo) => {
      const large = typeof photo.src?.large === "string" ? photo.src.large : "";
      const medium = typeof photo.src?.medium === "string" ? photo.src.medium : "";
      const tiny = typeof photo.src?.tiny === "string" ? photo.src.tiny : "";
      const hit = asHit({
        url: medium || large,
        thumbnail: medium || tiny || large,
        alt: typeof photo.alt === "string" ? photo.alt : "",
        source: "pexels",
        fallbackAlt: query,
      });
      return hit ? [hit] : [];
    }),
  };
}

async function searchPixabay(query: string, count: number): Promise<ProviderHits> {
  const key = pixabayKey();
  if (!key) return { hits: [], ok: true };
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", key);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("per_page", String(Math.max(3, count)));
  const fetched = await fetchJson(url.toString());
  if (!fetched.ok) return { hits: [], ok: false };
  const data = fetched.data as {
    hits?: Array<{
      largeImageURL?: unknown;
      webformatURL?: unknown;
      previewURL?: unknown;
      tags?: unknown;
    }>;
  };
  if (!data?.hits) return { hits: [], ok: true };
  return {
    ok: true,
    hits: data.hits.flatMap((item) => {
      const large = typeof item.largeImageURL === "string" ? item.largeImageURL : "";
      const web = typeof item.webformatURL === "string" ? item.webformatURL : "";
      const preview = typeof item.previewURL === "string" ? item.previewURL : "";
      const hit = asHit({
        url: web || large,
        thumbnail: web || preview || large,
        alt: typeof item.tags === "string" ? item.tags : "",
        source: "pixabay",
        fallbackAlt: query,
      });
      return hit ? [hit] : [];
    }),
  };
}

async function searchProviders(plan: ImageSearchPlan, keep: number): Promise<ImageSearchHit[]> {
  const fetchCount = Math.min(20, Math.max(12, keep * 2));
  let hits: ImageSearchHit[] = [];
  let anyOk = false;

  const wiki = await searchWikimedia(plan.query, fetchCount);
  anyOk = anyOk || wiki.ok;
  hits = pickImageHits(wiki.hits, plan, keep);
  if (hits.length >= 3) return hits;

  const simple = plan.must.filter((word) => word.length > 3).slice(0, 3).join(" ");
  if (simple && simple !== plan.query) {
    const wikiSimple = await searchWikimedia(simple, fetchCount);
    anyOk = anyOk || wikiSimple.ok;
    hits = mergeHits(hits, pickImageHits(wikiSimple.hits, plan, keep), keep);
    if (hits.length >= 3) return hits;
  }

  const openverse = await searchOpenverse(plan.query, fetchCount);
  anyOk = anyOk || openverse.ok;
  hits = pickImageHits(mergeHits(hits, openverse.hits, fetchCount), plan, keep);
  if (hits.length >= 2) return hits;

  if (hits.length === 0) {
    const google = await searchGoogleImages(plan.query, fetchCount);
    anyOk = anyOk || google.ok;
    hits = pickImageHits(google.hits, plan, keep);
  }

  if (hits.length === 0) {
    const pexels = await searchPexels(plan.query, fetchCount);
    anyOk = anyOk || pexels.ok;
    hits = pickImageHits(pexels.hits, plan, keep);
  }

  if (hits.length === 0) {
    const pixabay = await searchPixabay(plan.query, fetchCount);
    anyOk = anyOk || pixabay.ok;
    hits = pickImageHits(pixabay.hits, plan, keep);
  }

  if (!anyOk && hits.length === 0) {
    throw new ImageSearchError("Image search failed.");
  }
  return hits;
}

export async function searchWebImages(query: string, count?: number): Promise<ImageSearchHit[]> {
  const q = query.trim();
  if (!q) throw new ImageSearchError("Missing search query.");
  const limit = clampImageCount(count);
  const plan = await planImageSearch(q);
  const key = `rel7:${normalizeImageQuery(plan.query)}:${plan.must.join("-")}:${limit}`;
  const cached = readCache(key);
  if (cached && cached.length > 0) return cached.slice(0, limit);

  let hits = await searchProviders(plan, limit);
  if (hits.length === 0) {
    const expanded = expandEnglishImageQuery(plan.query);
    if (expanded && expanded !== plan.query) {
      hits = await searchProviders({ ...plan, query: expanded }, limit);
    }
  }
  if (hits.length > 0) writeCache(key, hits);
  return hits;
}
