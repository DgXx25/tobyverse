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
  if (!isLibraryImage(item)) return [];
  const fromImages = sortedImagePaths(item);
  return usablePaths([...fromImages, item.storagePath ?? ""]);
}

export function librarySlidePaths(item: LibraryItem): string[] {
  return usablePaths(sortedImagePaths(item));
}
