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
  const fromField = material.originalName?.trim() || "";
  if (fromField && fromField !== "extracted.txt" && !fromField.includes("/") && !fromField.includes("..")) {
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
  if (title && title !== "extracted.txt") return title;
  return originalStoredName(material) || "Material";
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

export function slidesFromMaterial(material: Material): ViewerSlide[] {
  const original = originalStoredName(material);
  return slidesFromImages(material.images ?? []).filter((slide) => {
    return Boolean(slide.fileName) && isPreviewImageName(slide.fileName || "", original);
  });
}

export function slidesFromListedNames(names: string[], originalName: string | null): ViewerSlide[] {
  const images: MaterialImage[] = [];
  for (const raw of names) {
    const name = storedObjectName(raw);
    if (!name || !isPreviewImageName(name, originalName)) continue;
    images.push({
      page: pageFromStoredName(name) ?? images.length + 1,
      path: name,
      mime: "image/*",
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
