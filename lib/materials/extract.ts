import { extractDocxText } from "@/lib/materials/docx";
import { EXTRACT_MAX_CHARS, MAX_SLIDE_IMAGES, clipText } from "@/lib/materials/limits";
import { extractPdf } from "@/lib/materials/pdf";
import { extractPptx, type ExtractedSlideImage } from "@/lib/materials/pptx";
import { extractTxtText } from "@/lib/materials/txt";
import { inferMaterialType } from "@/lib/materials/types";
import type { MaterialType } from "@/types/material";

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
};

export type ExtractResult = {
  text: string;
  type: MaterialType;
  pageCount: number;
  images: ExtractedImagePayload[];
};

function toPayload(images: ExtractedSlideImage[]): ExtractedImagePayload[] {
  return images.slice(0, MAX_SLIDE_IMAGES).map((item) => ({
    page: item.page,
    mime: item.mime,
    data: Buffer.from(item.bytes).toString("base64"),
  }));
}

export async function extractImageText(buffer: Buffer, mime: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new MaterialExtractError("GOOGLE_GENERATIVE_AI_API_KEY is not set.");
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const result = await new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: "gemini-2.5-flash",
  }).generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Extract all readable text from this image. If it is a diagram, describe it briefly. Plain text only.",
          },
          {
            inlineData: {
              mimeType: mime || "image/jpeg",
              data: buffer.toString("base64"),
            },
          },
        ],
      },
    ],
  });
  const text = result.response.text().trim();
  if (!text) {
    throw new MaterialExtractError("Could not read that image.");
  }
  return clipText(text, EXTRACT_MAX_CHARS);
}

export async function extractPlainText(input: {
  filename: string;
  mime: string;
  buffer: Buffer;
  type?: MaterialType;
}): Promise<ExtractResult> {
  const type = input.type ?? inferMaterialType(input.filename, input.mime);
  if (!type || type === "paste" || type === "url") {
    throw new MaterialExtractError("Only PDF, DOCX, PPTX, TXT, MD, and PNG/JPG/WEBP files are supported.");
  }

  try {
    if (type === "image") {
      const mime = input.mime.startsWith("image/") ? input.mime : "image/jpeg";
      const text = await extractImageText(input.buffer, mime);
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

    if (type === "pptx") {
      const pptx = await extractPptx(input.buffer);
      return {
        text: clipText(pptx.text, EXTRACT_MAX_CHARS),
        type,
        pageCount: pptx.pageCount,
        images: toPayload(pptx.images),
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
