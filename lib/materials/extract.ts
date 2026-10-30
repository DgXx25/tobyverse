import { extractDocx, extractDocxText } from "@/lib/materials/docx";
import { EXTRACT_MAX_CHARS, clipText } from "@/lib/materials/limits";
import { extractPdf } from "@/lib/materials/pdf";
import { extractPptx } from "@/lib/materials/pptx";
import { extractTxtText } from "@/lib/materials/txt";
import { inferMaterialType } from "@/lib/materials/types";
import type { MaterialType } from "@/types/material";
import { generateText } from "@/lib/ai/gemini";
import type { AiUsageReporter } from "@/types/billing";

export class MaterialExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialExtractError";
  }
}

export type ExtractedImagePayload = {
  page: number;
  mime: string;
  data: string;
  kind?: "figure" | "slide";
  complete?: boolean;
};

export type ExtractResult = {
  text: string;
  type: MaterialType;
  pageCount: number;
  images: ExtractedImagePayload[];
};

export async function extractImageText(buffer: Buffer, mime: string, usage?: AiUsageReporter): Promise<string> {
  const text = (await generateText(
    "Read the image for later text search. Return two short sections: Visible text: transcribe legible words, numbers, labels and table values as faithfully as possible, keeping table rows/columns understandable. Visual description: one concise sentence describing what the image shows, including relevant relationships, trends, objects or scene details. Do not guess unreadable values; mark them [unclear]. If no text is visible, say so and still describe the image. Plain text only.",
    { images: [{ mimeType: mime || "image/jpeg", data: buffer.toString("base64") }], usage },
  )).trim();
  if (!text || text === "[NO_READABLE_TEXT]") {
    throw new MaterialExtractError("Could not read or describe this image; the original has been kept.");
  }
  return clipText(text, EXTRACT_MAX_CHARS);
}

async function extractEmbeddedImageText(images: { label: string; mime: string; bytes: Uint8Array }[], usage?: AiUsageReporter): Promise<string> {
  if (!images.length) return "";
  const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const supported = images.filter(image => supportedTypes.has(image.mime.toLowerCase()));
  const unsupported = images.filter(image => !supportedTypes.has(image.mime.toLowerCase()));
  const response = supported.length ? await generateText(
    `These images are embedded in a document. They are supplied in this order: ${supported.map(image => image.label).join(", ")}. Return one compact entry per image, each on its own line, in the same order and beginning with its supplied label followed by an em dash. For each image, include “Visible text:” with legible words, numbers, labels and table values transcribed faithfully, then “Visual description:” with one brief factual description of what it shows and relevant objects, relationships or trends. Do not guess unreadable content; mark it [unclear]. Keep each entry under 70 words. Do not merge images. Plain text only.`,
    {
      images: supported.map(image => ({ mimeType: image.mime, data: Buffer.from(image.bytes).toString("base64") })),
      usage,
    },
  ) : "";
  const trimmed = response.trim();
  const missingSupported = supported.filter(image => !trimmed.toLowerCase().includes(image.label.toLowerCase()));
  const fallbacks = [
    ...missingSupported.map(image => `${image.label} — Visible text: not reliably detected. Visual description: embedded image; a description could not be generated.`),
    ...unsupported.map(image => `${image.label} — Visual description: this embedded image format could not be analyzed.`),
  ];
  return [trimmed, ...fallbacks].filter(Boolean).join("\n");
}

export async function extractPlainText(input: {
  filename: string;
  mime: string;
  buffer: Buffer;
  type?: MaterialType;
  includeImages?: boolean;
  usage?: AiUsageReporter;
}): Promise<ExtractResult> {
  const type = input.type ?? inferMaterialType(input.filename, input.mime);
  if (!type || type === "paste" || type === "url") {
    throw new MaterialExtractError("Only PDF, DOCX, PPTX, XLS/XLSX, TXT, MD, and PNG/JPG/WEBP files are supported.");
  }

  try {
    if (type === "image") {
      const mime = input.mime.startsWith("image/") ? input.mime : "image/jpeg";
      const text = await extractImageText(input.buffer, mime, input.usage);
      return { text, type, pageCount: 1, images: [] };
    }

    if (type === "pdf") {
      const pdf = await extractPdf(new Uint8Array(input.buffer));
      return { text: clipText(pdf.text, EXTRACT_MAX_CHARS), type, pageCount: pdf.pageCount, images: [] };
    }

    if (type === "docx") {
      const docx = input.includeImages === false
        ? { text: await extractDocxText(input.buffer), images: [] }
        : await extractDocx(input.buffer, true);
      const imageNotes = await extractEmbeddedImageText(
        docx.images.map((image, index) => ({ ...image, label: `Image ${index + 1}` })),
        input.usage,
      );
      const noteLines = imageNotes.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const text = docx.text.replace(/\[\[TOBY_IMAGE_(\d+)\]\]/g, (_, rawIndex: string) => {
        const imageIndex = Number(rawIndex);
        const note = noteLines.find(line => new RegExp(`^(?:[-*]\\s*)?Image ${imageIndex + 1}\\s*[—:-]`, "i").test(line));
        const fallback = `Image ${imageIndex + 1} — Visible text: not reliably detected. Visual description: embedded image; a description could not be generated.`;
        return `\n${note || fallback}\n`;
      });
      return { text: clipText(text, EXTRACT_MAX_CHARS), type, pageCount: 1, images: [] };
    }

    if (type === "xlsx") {
      const { read, utils } = await import("xlsx");
      const book = read(input.buffer, { type: "buffer" });
      const text = book.SheetNames.map((name) => `${name}\n${utils.sheet_to_csv(book.Sheets[name])}`).join("\n\n");
      return { text: clipText(text, EXTRACT_MAX_CHARS), type, pageCount: book.SheetNames.length, images: [] };
    }

    if (type === "pptx") {
      const pptx = await extractPptx(input.buffer, { includeImages: input.includeImages !== false });
      const imageNotes = input.includeImages === false ? "" : await extractEmbeddedImageText(
        pptx.images.map((image, index) => ({ ...image, label: `Slide ${image.page}, image ${index + 1}` })),
        input.usage,
      );
      return {
        text: clipText([pptx.text, imageNotes && `Embedded image notes\n${imageNotes}`].filter(Boolean).join("\n\n"), EXTRACT_MAX_CHARS),
        type,
        pageCount: pptx.pageCount,
        images: [],
      };
    }

    const text = extractTxtText(input.buffer);
    return { text: clipText(text, EXTRACT_MAX_CHARS), type, pageCount: 1, images: [] };
  } catch (error) {
    if (error instanceof MaterialExtractError) throw error;
    const message = error instanceof Error ? error.message : "Could not read this file.";
    throw new MaterialExtractError(message);
  }
}
