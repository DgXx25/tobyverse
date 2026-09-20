/** Public image URLs only. Never downloaded or stored as files. */
export type ImageSearchHit = {
  url: string;
  thumbnail: string;
  alt: string;
  source: string;
};

export const IMAGE_SEARCH_DEFAULT = 8;
export const IMAGE_SEARCH_MAX = 8;
/** Wikimedia CDN only allows these widths (https://w.wiki/GHai). */
export const WIKI_THUMB_STEPS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840] as const;
export const IMAGE_THUMB_WIDTH = 330;
export const IMAGE_PREVIEW_WIDTH = 960;

export function snapWikiThumbUrl(url: string): string {
  if (!url) return url;
  return url.replace(/\/(\d+)px-/i, (_, raw: string) => {
    const width = Number(raw);
    const step = WIKI_THUMB_STEPS.find((size) => size >= width) ?? 3840;
    return `/${step}px-`;
  });
}
