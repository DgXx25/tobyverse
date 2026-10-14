import type { MaterialType } from "@/types/material";

export const MATERIAL_FILE_ACCEPT = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".heic",
  ".heif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
].join(",");

export const COMPOSER_FILE_ACCEPT = `image/*,${MATERIAL_FILE_ACCEPT}`;

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PPT_MIME = "application/vnd.ms-powerpoint";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function inferMaterialType(filename: string, mime: string): MaterialType | null {
  const name = filename.toLowerCase();
  const type = mime.toLowerCase();

  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp") || name.endsWith(".heic") || name.endsWith(".heif")) {
    return "image";
  }
  if (type === "image/png" || type === "image/jpeg" || type === "image/webp") return "image";
  if (type === "image/heic" || type === "image/heif" || type === "image/heic-sequence" || type === "image/heif-sequence") return "image";
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (/\.xlsx?$/.test(name) || type === "application/vnd.ms-excel" || type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (name.endsWith(".docx") || type === DOCX_MIME) return "docx";
  if (name.endsWith(".pptx") || name.endsWith(".ppt") || type === PPTX_MIME || type === PPT_MIME) {
    return "pptx";
  }
  if (name.endsWith(".md") || type === "text/markdown") return "md";
  if (name.endsWith(".txt") || type === "text/plain") return "txt";

  return null;
}

export function materialFileName(type: MaterialType, originalName: string): string {
  if (type === "paste") return "notes.txt";
  if (type === "url") return "source.txt";
  if (/\.(?:heic|heif)$/i.test(originalName.trim())) {
    const base = originalName.trim().replace(/[\\/]+/g, "_").replace(/\.(?:heic|heif)$/i, "").replace(/[^\w-]+/g, "_");
    return `${base.slice(0, 76) || "photo"}.jpg`;
  }
  const original = originalName.trim().replace(/[\\/]+/g, "_");
  const dot = original.lastIndexOf(".");
  const extension = dot > 0 ? original.slice(dot).replace(/[^\w.\-]/g, "") : "";
  const base = (dot > 0 ? original.slice(0, dot) : original).replace(/[^\w\-]+/g, "_");
  const fallbackExtension = type === "image" ? "png" : type;
  const suffix = extension || `.${fallbackExtension}`;
  const maxBaseLength = Math.max(1, 80 - suffix.length);
  const safe = `${base.slice(0, maxBaseLength)}${suffix}`;
  return safe || `source.${fallbackExtension}`;
}

export function mimeFromName(name: string, fallback = "application/octet-stream"): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return fallback;
}

export function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}
