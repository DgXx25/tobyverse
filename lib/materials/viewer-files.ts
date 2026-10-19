import { storedObjectName } from "@/lib/materials/storage-path";
import type { Material, MaterialImage } from "@/types/material";

export type ViewerSlide = {
  page: number;
  fileName: string | null;
  storagePath: string | null;
};

const IMAGE_NAME = /\.(png|jpe?g|webp|gif)$/i;
const SLIDE_NAME = /^(?:slide|page)-(\d+)(?:-\d+)?\.(png|jpe?g|webp|gif)$/i;
const PRIMARY_SLIDE_NAME = /^(?:slide|page)-(\d+)\.(png|jpe?g|webp|gif)$/i;
const ORIGINAL_FILE = /\.(pptx|ppt|pdf|docx|txt|md)$/i;

export function originalStoredName(material: Material): string | null {
  // Compression can change the extension without changing the original metadata.
  if (material.type === "image" && !material.originalRemoved) {
    const storedName = storedObjectName(material.storagePath);
    if (storedName && storedName !== "extracted.txt") return storedName;
  }
  const fromField = material.originalName?.trim() || "";
  if (fromField && (fromField !== "extracted.txt" || material.originalRemoved) && !fromField.includes("/") && !fromField.includes("..")) {
    return fromField;
  }
  const name = storedObjectName(material.storagePath);
  if (!name || name === "extracted.txt") return null;
  return name;
}

export function extractedStoredName(material: Material): string | null {
  const name =
    storedObjectName(material.extractedPath) || storedObjectName(material.textPath) || "extracted.txt";
  return name || "extracted.txt";
}

export function viewerTitle(material: Material): string {
  const title = material.title?.trim() || "";
  if (title && title !== "extracted.txt") return displayFileTitle(title);
  return displayFileTitle(originalStoredName(material) || "Material");
}

export function pageFromStoredName(name: string | null): number | null {
  if (!name) return null;
  const match = SLIDE_NAME.exec(name);
  if (!match) return null;
  const page = Number(match[1]);
  return Number.isFinite(page) && page > 0 ? page : null;
}

function isPrimarySlideName(name: string, page: number): boolean {
  const match = PRIMARY_SLIDE_NAME.exec(name);
  return Boolean(match) && Number(match?.[1]) === page;
}

function imagePage(image: MaterialImage): number {
  const fromName = pageFromStoredName(storedObjectName(image.path));
  if (typeof image.page === "number" && Number.isFinite(image.page) && image.page > 0) {
    return Math.floor(image.page);
  }
  return fromName ?? 1;
}

function isPreviewImageName(name: string, originalName: string | null): boolean {
  if (!name || name === "extracted.txt") return false;
  if (originalName && name === originalName) return false;
  if (ORIGINAL_FILE.test(name)) return false;
  return IMAGE_NAME.test(name);
}

function pickPrimaryImage(images: MaterialImage[], page: number): MaterialImage | null {
  const candidates = images.filter((image) => imagePage(image) === page && storedObjectName(image.path));
  if (candidates.length === 0) return null;
  return (
    candidates.find((image) => {
      const name = storedObjectName(image.path);
      return name ? isPrimarySlideName(name, page) : false;
    }) ?? candidates[0]
  );
}

/** Only objects named on the material record. Never pads to pageCount or invents slide-N.png. */
export function slidesFromImages(images: MaterialImage[], _pageCount = 0): ViewerSlide[] {
  // Only page renders and complete slide renders are valid visual pages.
  images = images.filter((image) => {
    return image.kind === "page" || (image.kind === "slide" && image.complete !== false);
  });
  const pages = new Set<number>();
  for (const image of images) {
    const name = storedObjectName(image.path);
    if (!name || name === "extracted.txt") continue;
    pages.add(imagePage(image));
  }
  const slides: ViewerSlide[] = [];
  for (const page of [...pages].sort((a, b) => a - b)) {
    const image = pickPrimaryImage(images, page);
    const fileName = image ? storedObjectName(image.path) : null;
    if (!fileName) continue;
    slides.push({ page, fileName, storagePath: image?.path ?? null });
  }
  return slides;
}

export function mergeViewerPages(images: ViewerSlide[], textPages: Iterable<number>): ViewerSlide[] {
  const byPage = new Map<number, ViewerSlide>();
  for (const slide of images) byPage.set(slide.page, slide);
  for (const page of textPages) {
    if (!byPage.has(page)) byPage.set(page, { page, fileName: null, storagePath: null });
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

export function slidesFromMaterial(material: Material): ViewerSlide[] {
  const original = originalStoredName(material);
  const slides = slidesFromImages(material.images ?? []).filter((slide) => {
    return Boolean(slide.fileName) && isPreviewImageName(slide.fileName || "", original);
  });
  const preview = storedObjectName(material.previewPagePath);
  if (preview && IMAGE_NAME.test(preview) && !slides.some((slide) => slide.page === 1)) {
    slides.unshift({ page: 1, fileName: preview, storagePath: material.previewPagePath! });
  }
  return slides;
}

export function slidesFromListedNames(names: string[], originalName: string | null): ViewerSlide[] {
  const images: MaterialImage[] = [];
  for (const raw of names) {
    const name = storedObjectName(raw);
    if (!name || !isPreviewImageName(name, originalName)) continue;
    if (/\.pptx?$/i.test(originalName || "") && !/^slide-\d+\.(png|jpe?g|webp|gif)$/i.test(name)) continue;
    images.push({
      page: pageFromStoredName(name) ?? images.length + 1,
      path: name,
      mime: "image/*",
      kind: /\.pptx?$/i.test(originalName || "") ? "slide" : "page",
      complete: /\.pptx?$/i.test(originalName || "") ? true : undefined,
    });
  }
  return slidesFromImages(images);
}

export function splitSlideText(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const matches = [...text.matchAll(/^Slide\s+(\d+)\s*\n/gm)];
  if (matches.length === 0) {
    const trimmed = text.trim();
    if (trimmed) map.set(1, trimmed);
    return map;
  }
  for (let i = 0; i < matches.length; i += 1) {
    const page = Number(matches[i][1]);
    const start = (matches[i].index ?? 0) + (matches[i][0].length);
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    map.set(page, text.slice(start, end).trim());
  }
  return map;
}

export function paginateText(text: string, pageSize = 2400): Map<number, string> {
  const pages: string[] = [];
  for (const section of text.split("\f")) {
    let remaining = section.trim();
    while (remaining.length > pageSize) {
      let end = remaining.lastIndexOf("\n", pageSize);
      if (end < pageSize / 2) end = remaining.lastIndexOf(" ", pageSize);
      if (end < pageSize / 2) end = pageSize;
      pages.push(remaining.slice(0, end).trim());
      remaining = remaining.slice(end).trim();
    }
    if (remaining) pages.push(remaining);
  }
  return new Map(pages.map((page, index) => [index + 1, page]));
}

export function decodeHtmlEntities(title: string): string {
  return title.replace(/&#(x[0-9a-f]+|\d+);/gi, (match, value: string) => {
    const code = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
  }).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x20;/gi, " ");
}

export function displayFileTitle(title: string): string {
  return decodeHtmlEntities(title);
}
