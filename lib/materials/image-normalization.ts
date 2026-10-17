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
  const base = input.filename.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 76) || "photo";
  try {
    if (isHeicUpload(filename, mime)) {
      buffer = await sharp(buffer).rotate().jpeg().toBuffer();
      filename = `${base}.jpg`;
      mime = "image/jpeg";
      converted = true;
    }
    if (input.chatImage && buffer.byteLength > CHAT_IMAGE_MAX_BYTES) {
      const original = buffer;
      for (const [size, quality] of [[3072, 85], [2560, 80], [2048, 75], [1600, 70]]) {
        buffer = await sharp(original).rotate().flatten({ background: "#ffffff" })
          .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
        if (buffer.byteLength <= CHAT_IMAGE_MAX_BYTES) break;
      }
      if (buffer.byteLength > CHAT_IMAGE_MAX_BYTES) throw new Error("Image remains too large.");
      filename = `${base}.jpg`;
      mime = "image/jpeg";
      converted = true;
    }
    return { buffer, filename, mime, converted };
  } catch {
    if (input.chatImage) throw new Error("Could not prepare this photo for chat. Please try a smaller JPG or PNG.");
    throw new Error("Could not convert this HEIC/HEIF photo to JPEG. Please export as JPG or PNG and try again.");
  }
}
