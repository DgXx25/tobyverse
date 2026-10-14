import sharp from "sharp";

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
}): Promise<NormalizedImageUpload> {
  if (!isHeicUpload(input.filename, input.mime)) {
    return { ...input, converted: false };
  }

  try {
    const buffer = await sharp(input.buffer).jpeg().toBuffer();
    const base = input.filename.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_").slice(0, 76) || "photo";
    const filename = `${base}.jpg`;
    return { buffer, filename, mime: "image/jpeg", converted: true };
  } catch {
    throw new Error("Could not convert this HEIC/HEIF photo to JPEG. Please export as JPG or PNG and try again.");
  }
}
