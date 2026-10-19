import { parseMaterialStoragePath, storedObjectName } from "@/lib/materials/storage-path";
import { slidesFromImages } from "@/lib/materials/viewer-files";
import type { LibraryItem } from "@/lib/library/items";

export type LibraryFileKind = "pdf" | "doc" | "docx" | "csv" | "excel" | "ppt" | "pptx" | "jpg" | "png" | "txt" | "md" | "notes" | "other";

export function isLibraryImage(item: LibraryItem): boolean {
  return item.kind === "material" && item.materialType === "image";
}
export function isLibraryPptx(item: LibraryItem): boolean {
  return item.kind === "material" && item.materialType === "pptx";
}

function fileHaystack(item: LibraryItem): string {
  return `${item.title} ${item.storagePath ?? ""} ${item.materialType ?? ""}`.toLowerCase();
}

export function libraryFileKind(item: LibraryItem): LibraryFileKind {
  if (item.kind === "sheet") return "notes";
  const hay = fileHaystack(item);
  if (/\.(?:jpe?g)\b/.test(hay)) return "jpg";
  if (/\.png\b/.test(hay) || item.materialType === "image") return "png";
  if (item.materialType === "pdf" || hay.includes(".pdf")) return "pdf";
  if (item.materialType === "docx" || /\.docx\b/.test(hay)) return "docx";
  if (/\.doc\b/.test(hay)) return "doc";
  if (item.materialType === "pptx" || /\.pptx\b/.test(hay)) return "pptx";
  if (/\.ppt\b/.test(hay)) return "ppt";
  if (/\.csv\b/.test(hay)) return "csv";
  if (
    item.materialType === "xlsx" ||
    /\.(?:xlsx?|xlsm|ods|numbers|tsv|gsheet)\b/.test(hay) ||
    hay.includes("google sheet") ||
    hay.includes("google sheets")
  ) return "excel";
  if (item.materialType === "md" || /\.md\b/.test(hay)) return "md";
  if (item.materialType === "txt" || item.materialType === "paste" || /\.txt\b/.test(hay)) return "txt";
  return "other";
}

function sortedImagePaths(item: LibraryItem): string[] {
  return slidesFromImages(item.images ?? [], item.pageCount)
    .map((slide) => slide.storagePath)
    .filter((path): path is string => Boolean(path));
}

function usablePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const path of paths) {
    if (!path || seen.has(path) || !parseMaterialStoragePath(path)) continue;
    seen.add(path);
    next.push(path);
  }
  return next;
}

export function libraryThumbPaths(item: LibraryItem): string[] {
  if (!isLibraryImage(item) || item.originalRemoved) return [];
  const fromImages = sortedImagePaths(item);
  return usablePaths([...fromImages, item.storagePath ?? ""]);
}

export function librarySlidePaths(item: LibraryItem): string[] {
  if (item.originalRemoved) return [];
  return usablePaths(sortedImagePaths(item));
}

const RASTER = /\.(png|jpe?g|webp|gif)$/i;

/** First real page to paint on a tile. Icon stays until this file is ready. */
export function libraryThumbTarget(item: LibraryItem): { name: string; mode: "image" | "pdf" } | null {
  if (item.kind !== "material" || item.originalRemoved) return null;
  const preview = storedObjectName(item.previewPagePath);
  if (preview && RASTER.test(preview)) return { name: preview, mode: "image" };
  const slide = slidesFromImages(item.images ?? [], item.pageCount)[0];
  if (slide?.fileName && RASTER.test(slide.fileName)) return { name: slide.fileName, mode: "image" };
  if (item.materialType === "image") {
    const name = storedObjectName(item.storagePath);
    if (name) return { name, mode: "image" };
  }
  if (item.materialType === "pdf") {
    const name = storedObjectName(item.storagePath);
    if (name && !name.endsWith(".txt")) return { name, mode: "pdf" };
  }
  return null;
}
