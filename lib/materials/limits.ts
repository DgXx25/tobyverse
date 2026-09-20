export const PREVIEW_MAX_CHARS = 300;
export const EXTRACT_MAX_CHARS = 120_000;
export const CHAT_EXCERPT_CHARS = 420;
export const CHAT_MATERIAL_LIMIT = 3;
export const SHEET_EXCERPT_CHARS = 2_000;
export const SHEET_TOTAL_CHARS = 6_000;
/** Path map only — week windows, never a textbook dump. */
export const PATH_EXCERPT_CHARS = 3_500;
export const PATH_TOTAL_CHARS = 16_000;
export const PATH_SOURCE_LIMIT = 5;
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "200 MB";
/** Multipart form overhead on top of the file cap. */
export const MAX_UPLOAD_BODY_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

export function uploadTooLargeMessage(): string {
  return `File is larger than ${MAX_UPLOAD_LABEL}.`;
}

export const MAX_SLIDE_IMAGES = 16;
export const CHAT_IMAGE_LIMIT = 2;
export const CHAT_IMAGE_MAX_BYTES = 1_500_000;
export const PREVIEW_HTML_MAX = 80_000;
export const PREVIEW_IMAGE_MAX_BYTES = 250_000;

export function previewText(text: string, max = PREVIEW_MAX_CHARS): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

export function clipText(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trim()}…`;
}
