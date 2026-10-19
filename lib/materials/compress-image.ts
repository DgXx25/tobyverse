import { CHAT_IMAGE_MAX_BYTES } from "@/lib/materials/limits";
import { materialFileName } from "@/lib/materials/types";

export const IMAGE_MAX_DIMENSION = 2560;

export function compressedImageDimensions(width: number, height: number, max = IMAGE_MAX_DIMENSION) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type CompressedImage = { blob: Blob; name: string; mime: string };

/** Re-encode before upload: bake in EXIF orientation, strip metadata, and retain alpha. */
export async function compressImageForUpload(file: File): Promise<CompressedImage> {
  let image: CanvasImageSource;
  let width: number;
  let height: number;
  let dispose = () => {};
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      image = bitmap;
      width = bitmap.width;
      height = bitmap.height;
      dispose = () => bitmap.close();
    } else {
      const url = URL.createObjectURL(file);
      const element = new Image();
      dispose = () => URL.revokeObjectURL(url);
      element.src = url;
      await element.decode();
      image = element;
      width = element.naturalWidth;
      height = element.naturalHeight;
    }
  } catch {
    dispose();
    // HEIC needs the existing server decoder in browsers that cannot decode it.
    // It is compressed there before the first Storage write.
    if (/\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type)) {
      return { blob: file, name: materialFileName("image", file.name), mime: file.type || "image/heic" };
    }
    throw new Error("Could not prepare this photo. Please try a JPG, PNG or WEBP image.");
  }
  try {
    if (!width || !height) throw new Error("This image has no readable pixels.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo.");
    let max = IMAGE_MAX_DIMENSION;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const size = compressedImageDimensions(width, height, max);
      canvas.width = size.width;
      canvas.height = size.height;
      context.drawImage(image, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", Math.max(0.6, 0.84 - attempt * 0.04)));
      if (!blob) throw new Error("Could not compress this photo.");
      if (blob.size <= CHAT_IMAGE_MAX_BYTES) {
        // Browsers without WebP encoding may return PNG, which also preserves alpha.
        const mime = blob.type || "image/png";
        const extension = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : "png";
        const name = materialFileName("image", `${file.name.replace(/\.[^.]+$/, "")}.${extension}`);
        return { blob, name, mime };
      }
      max = Math.max(320, Math.round(max * 0.75));
    }
    throw new Error("Could not make this photo small enough. Please try a smaller image.");
  } finally {
    dispose();
  }
}
