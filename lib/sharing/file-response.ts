const SAFE_INLINE_MIMES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export function safeInlineMime(value: string): string | null {
  const mime = value.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  return SAFE_INLINE_MIMES.has(mime) ? mime : null;
}
