import type { MaterialType } from "@/types/material";

export const MATERIAL_FILE_ACCEPT = [
  ".pdf",
  ".docx",
  ".pptx",
  ".ppt",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
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

  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp")) {
    return "image";
  }
  if (type === "image/png" || type === "image/jpeg" || type === "image/webp") return "image";
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
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
  const safe = originalName.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  return safe || `source.${type === "image" ? "png" : type}`;
}

export function mimeFromName(name: string, fallback = "application/octet-stream"): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return fallback;
}

export function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}
