import mammoth from "mammoth";
import { MAX_SLIDE_IMAGES } from "@/lib/materials/limits";

export type ExtractedDocxImage = { mime: string; bytes: Uint8Array };

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  if (!text) {
    throw new Error("This Word file has no extractable text.");
  }
  return text;
}

function htmlToOrderedText(html: string): string {
  return html
    .replace(/<img\b[^>]*data-toby-image=["'](\d+)["'][^>]*>/gi, (_, index: string) => `\n[[TOBY_IMAGE_${index}]]\n`)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|tr|li|div|table|ul|ol)\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCharCode(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocx(buffer: Buffer, includeImages: boolean): Promise<{ text: string; images: ExtractedDocxImage[] }> {
  const images: ExtractedDocxImage[] = [];
  const result = await mammoth.convertToHtml({ buffer }, includeImages ? {
    convertImage: mammoth.images.imgElement(async image => {
      if (images.length >= MAX_SLIDE_IMAGES) return { src: "" };
      const index = images.length;
      images.push({ mime: image.contentType || "image/png", bytes: new Uint8Array(await image.readAsBuffer()) });
      return { src: "", "data-toby-image": String(index) } as { src: string };
    }),
  } : undefined);
  if (!images.length) return { text: await extractDocxText(buffer), images };
  const text = htmlToOrderedText(result.value);
  return { text, images };
}
