import { englishImageQuery, expandEnglishImageQuery } from "@/lib/images/query";

export type ImageSearchHit = {
  url: string;
  thumb: string;
  title: string;
  source: string;
  license: string;
  credit: string;
  pageUrl?: string;
};

export class ImageSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageSearchError";
  }
}

export const IMAGE_SEARCH_MAX = 8;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 200;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const FETCH_MS = 8000;
const UA = "Tobyverse/1.0 (study app; image search)";

const BLOCK_HOST =
  /pinterest|instagram|facebook|fbcdn|twitter|x\.com|tiktok|gettyimages|shutterstock|alamy|istockphoto/i;

const IMG_HOST =
  /gstatic|googleusercontent|ggpht|ytimg|wikimedia|wikipedia|openverse|flickr|staticflickr|imgur|unsplash|pexels|pixabay|cloudinary|imgix|twimg|bp\.blogspot|wp\.com|media\.tumblr/i;

type CacheEntry = { at: number; hits: ImageSearchHit[] };

const memoryCache = new Map<string, CacheEntry>();
const rateStamps = new Map<string, number[]>();

function cseConfig() {
  const cx = (process.env.GOOGLE_CSE_ID ?? process.env.GOOGLE_SEARCH_ENGINE_ID ?? "").trim();
  const key = (process.env.GOOGLE_CSE_API_KEY ?? "").trim();
  return { cx, key };
}

export function imageSearchConfigured(): boolean {
  return true;
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

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function isDirectImage(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg|avif)(\?|$)/i.test(url) || /upload\.wikimedia|flickrstatic|openverse/i.test(url);
}

function embeddable(url: string): boolean {
  if (!url || !isHttps(url)) return false;
  if (BLOCK_HOST.test(url)) return false;
  if (isDirectImage(url)) return true;
  if (IMG_HOST.test(url)) return true;
  return false;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatLicense(license: string, version?: string): string {
  const id = license.trim();
  if (!id) return "";
  const lower = id.toLowerCase();
  if (lower === "cc0" || lower.startsWith("cc0")) return "CC0";
  if (lower === "pdm" || lower === "pd" || lower.includes("public domain")) return "Public domain";
  if (/^by(-[a-z]+)*$/i.test(lower)) {
    const ver = version?.trim() ? ` ${version.trim()}` : "";
    return `CC ${id.toUpperCase()}${ver}`;
  }
  return id;
}

function asHit(input: {
  url?: string;
  thumb?: string;
  title?: string;
  source?: string;
  license?: string;
  credit?: string;
  pageUrl?: string;
  fallbackTitle: string;
}): ImageSearchHit | null {
  const thumb = (input.thumb || "").trim();
  const url = (input.url || "").trim();
  const display = embeddable(thumb) ? thumb : embeddable(url) ? url : "";
  if (!display) return null;
  const pageUrl = (input.pageUrl || "").trim();
  const source = (input.source || "").trim() || hostOf(pageUrl || display) || "web";
  return {
    url: embeddable(url) ? url : display,
    thumb: display,
    title: (input.title || "").trim() || input.fallbackTitle,
    source,
    license: (input.license || "").trim(),
    credit: stripHtml(input.credit || ""),
    pageUrl: pageUrl || undefined,
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

function mergeHits(base: ImageSearchHit[], extra: ImageSearchHit[]): ImageSearchHit[] {
  const out = [...base];
  const seen = new Set(base.map((hit) => hit.thumb || hit.url));
  for (const hit of extra) {
    const key = hit.thumb || hit.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= IMAGE_SEARCH_MAX) break;
  }
  return out;
}

type FetchJson = { ok: true; data: unknown } | { ok: false };

async function fetchJson(url: string): Promise<FetchJson> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": UA },
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

async function searchOpenverse(query: string): Promise<ProviderHits> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(IMAGE_SEARCH_MAX));
  url.searchParams.set("mature", "false");
  const fetched = await fetchJson(url.toString());
  if (!fetched.ok) return { hits: [], ok: false };
  const data = fetched.data as {
    results?: Array<{
      title?: unknown;
      url?: unknown;
      thumbnail?: unknown;
      foreign_landing_url?: unknown;
      license?: unknown;
      license_version?: unknown;
      creator?: unknown;
      attribution?: unknown;
      source?: unknown;
    }>;
  };
  if (!data?.results) return { hits: [], ok: true };
  return {
    ok: true,
    hits: data.results.flatMap((item) => {
    const pageUrl = typeof item.foreign_landing_url === "string" ? item.foreign_landing_url : "";
    const license = formatLicense(
      typeof item.license === "string" ? item.license : "",
      typeof item.license_version === "string" ? item.license_version : undefined,
    );
    const credit =
      typeof item.attribution === "string"
        ? item.attribution
        : typeof item.creator === "string"
          ? item.creator
          : "";
    const hit = asHit({
      url: typeof item.url === "string" ? item.url : "",
      thumb: typeof item.thumbnail === "string" ? item.thumbnail : "",
      title: typeof item.title === "string" ? item.title : "",
      source: hostOf(pageUrl) || (typeof item.source === "string" ? item.source : "") || "openverse.org",
      license,
      credit,
      pageUrl,
      fallbackTitle: query,
    });
    return hit ? [hit] : [];
    }),
  };
}

async function searchWikimedia(query: string): Promise<ProviderHits> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(IMAGE_SEARCH_MAX));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "400");
  const fetched = await fetchJson(url.toString());
  if (!fetched.ok) return { hits: [], ok: false };
  const data = fetched.data as {
    query?: {
      pages?: Array<{
        title?: unknown;
        imageinfo?: Array<{
          url?: unknown;
          thumburl?: unknown;
          descriptionurl?: unknown;
          mime?: unknown;
          extmetadata?: Record<string, { value?: unknown }>;
        }>;
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
    const meta = info?.extmetadata ?? {};
    const license = typeof meta.LicenseShortName?.value === "string" ? stripHtml(meta.LicenseShortName.value) : "";
    const credit =
      typeof meta.Artist?.value === "string"
        ? meta.Artist.value
        : typeof meta.Credit?.value === "string"
          ? meta.Credit.value
          : "";
    const pageUrl = typeof info?.descriptionurl === "string" ? info.descriptionurl : "";
    const hit = asHit({
      url: typeof info?.url === "string" ? info.url : "",
      thumb: typeof info?.thumburl === "string" ? info.thumburl : "",
      title: typeof page.title === "string" ? page.title.replace(/^File:/i, "") : "",
      source: hostOf(pageUrl) || "commons.wikimedia.org",
      license,
      credit,
      pageUrl,
      fallbackTitle: query,
    });
    return hit ? [hit] : [];
    }),
  };
}

async function searchCse(query: string): Promise<ProviderHits> {
  const { cx, key } = cseConfig();
  if (!cx || !key) return { hits: [], ok: true };
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", String(IMAGE_SEARCH_MAX));
  url.searchParams.set("safe", "active");
  const fetched = await fetchJson(url.toString());
  if (!fetched.ok) return { hits: [], ok: false };
  const data = fetched.data as {
    items?: Array<{
      title?: unknown;
      link?: unknown;
      displayLink?: unknown;
      image?: { thumbnailLink?: unknown; contextLink?: unknown };
    }>;
  };
  if (!data?.items) return { hits: [], ok: true };
  return {
    ok: true,
    hits: data.items.flatMap((item) => {
    const pageUrl = typeof item.image?.contextLink === "string" ? item.image.contextLink : "";
    const hit = asHit({
      url: typeof item.link === "string" ? item.link : "",
      thumb: typeof item.image?.thumbnailLink === "string" ? item.image.thumbnailLink : "",
      title: typeof item.title === "string" ? item.title : "",
      source: typeof item.displayLink === "string" ? item.displayLink : hostOf(pageUrl),
      license: "",
      credit: "",
      pageUrl,
      fallbackTitle: query,
    });
    return hit ? [hit] : [];
    }),
  };
}

async function searchProviders(query: string): Promise<ImageSearchHit[]> {
  let hits: ImageSearchHit[] = [];
  let anyOk = false;
  const openverse = await searchOpenverse(query);
  anyOk = anyOk || openverse.ok;
  hits = mergeHits(hits, openverse.hits);
  if (hits.length < IMAGE_SEARCH_MAX) {
    const wiki = await searchWikimedia(query);
    anyOk = anyOk || wiki.ok;
    hits = mergeHits(hits, wiki.hits);
  }
  if (hits.length < IMAGE_SEARCH_MAX) {
    const cse = await searchCse(query);
    anyOk = anyOk || cse.ok;
    hits = mergeHits(hits, cse.hits);
  }
  if (!anyOk && hits.length === 0) {
    throw new ImageSearchError("Image search failed.");
  }
  return hits.slice(0, IMAGE_SEARCH_MAX);
}

export async function searchWebImages(query: string): Promise<ImageSearchHit[]> {
  const q = query.trim();
  if (!q) throw new ImageSearchError("Missing search query.");
  const english = await englishImageQuery(q);
  const key = normalizeImageQuery(english);
  const cached = readCache(key);
  if (cached && cached.length > 0) return cached.slice(0, IMAGE_SEARCH_MAX);

  let hits = await searchProviders(english);
  if (hits.length === 0) {
    const expanded = expandEnglishImageQuery(english);
    if (expanded && expanded !== english) {
      hits = await searchProviders(expanded);
    }
  }
  hits = hits.slice(0, IMAGE_SEARCH_MAX);
  if (hits.length > 0) writeCache(key, hits);
  return hits;
}
