import { extractDocxText } from "@/lib/materials/docx";
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
    "Extract all readable text from this image. If it is a diagram, describe it briefly. Plain text only. If there is no readable text or diagram, return exactly [NO_READABLE_TEXT].",
    { images: [{ mimeType: mime || "image/jpeg", data: buffer.toString("base64") }], usage },
  )).trim();
  return text === "[NO_READABLE_TEXT]" ? "" : clipText(text, EXTRACT_MAX_CHARS);
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
      const text = await extractDocxText(input.buffer);
      return { text: clipText(text, EXTRACT_MAX_CHARS), type, pageCount: 1, images: [] };
    }

    if (type === "xlsx") {
      const { read, utils } = await import("xlsx");
      const book = read(input.buffer, { type: "buffer" });
      const text = book.SheetNames.map((name) => `${name}\n${utils.sheet_to_csv(book.Sheets[name])}`).join("\n\n");
      return { text: clipText(text, EXTRACT_MAX_CHARS), type, pageCount: book.SheetNames.length, images: [] };
    }

    if (type === "pptx") {
      const pptx = await extractPptx(input.buffer, { includeImages: false });
      return {
        text: clipText(pptx.text, EXTRACT_MAX_CHARS),
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
