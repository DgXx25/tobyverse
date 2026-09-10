/** Public image URLs only. Never downloaded or stored as files. */
export type ImageSearchHit = {
  url: string;
  thumbnail: string;
  alt: string;
  source: string;
};

export const IMAGE_SEARCH_DEFAULT = 6;
export const IMAGE_SEARCH_MAX = 10;
