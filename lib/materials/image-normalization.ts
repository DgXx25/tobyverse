import sharp from "sharp";
import { CHAT_IMAGE_MAX_BYTES } from "@/lib/materials/limits";

export type NormalizedImageUpload = {
  buffer: Buffer;
  filename: string;
  mime: string;
  converted: boolean;
};

export function isHeicUpload(filename: string, mime: string): boolean {
  return /\.(?:heic|heif)$/i.test(filename) || /^image\/(?:heic|heif)(?:-sequence)?$/i.test(mime);
}

export async function normalizeImageUpload(input: {
  filename: string;
  mime: string;
  buffer: Buffer;
  chatImage?: boolean;
}): Promise<NormalizedImageUpload> {
  let { buffer, filename, mime } = input;
  let converted = false;
  const isImage = /^image\//i.test(mime) || /\.(?:png|jpe?g|webp|heic|heif)$/i.test(filename);
  if (!isImage) return { buffer, filename, mime, converted };
  const base = input.filename.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 76) || "photo";
  try {
    const metadata = await sharp(buffer).metadata();
    if (isHeicUpload(filename, mime) || mime !== "image/webp" || buffer.byteLength > CHAT_IMAGE_MAX_BYTES ||
      Math.max(metadata.width || 0, metadata.height || 0) > 2560 || (metadata.orientation && metadata.orientation !== 1)) {
      const original = buffer;
      for (const [size, quality] of [[2560, 84], [2048, 80], [1600, 76], [1200, 70], [800, 65]]) {
        buffer = await sharp(original).rotate()
          .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
        if (buffer.byteLength <= CHAT_IMAGE_MAX_BYTES) break;
      }
      if (buffer.byteLength > CHAT_IMAGE_MAX_BYTES) throw new Error("Image remains too large.");
      filename = `${base}.webp`;
      mime = "image/webp";
      converted = true;
    }
    return { buffer, filename, mime, converted };
  } catch {
    throw new Error("Could not prepare this photo. Please try a smaller JPG, PNG or WEBP image.");
  }
}
