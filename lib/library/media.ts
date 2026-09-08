import { parseMaterialStoragePath } from "@/lib/materials/storage-path";
import { slidesFromImages } from "@/lib/materials/viewer-files";
import type { LibraryItem } from "@/lib/library/items";

export function isLibraryImage(item: LibraryItem): boolean {
  return item.kind === "material" && item.materialType === "image";
}

export function isLibraryPptx(item: LibraryItem): boolean {
  return item.kind === "material" && item.materialType === "pptx";
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
  if (item.kind !== "material") return [];
  if (
    item.materialType === "pdf" ||
    item.materialType === "txt" ||
    item.materialType === "md" ||
    item.materialType === "paste" ||
    item.materialType === "url" ||
    item.materialType === "docx"
  ) {
    return [];
  }

  const fromImages = sortedImagePaths(item);
  if (isLibraryImage(item)) {
    return usablePaths([...fromImages, item.storagePath ?? ""]);
  }

  if (fromImages[0]) return usablePaths([fromImages[0]]);
  return [];
}

export function librarySlidePaths(item: LibraryItem): string[] {
  return usablePaths(sortedImagePaths(item));
}
