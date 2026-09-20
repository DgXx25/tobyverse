import { extractText, getDocumentProxy } from "unpdf";
import { EXTRACT_MAX_CHARS } from "@/lib/materials/limits";

export type ExtractedPdf = {
  text: string;
  pageCount: number;
};

type PdfJsItem = { str?: string };
type PdfJsPage = {
  getTextContent: () => Promise<{ items: PdfJsItem[] }>;
};
type PdfJsDoc = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy?: () => Promise<unknown>;
};

function pageBody(items: PdfJsItem[]): string {
  return items
    .map((item) => item.str ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stop once we have EXTRACT_MAX_CHARS. Do not walk a 150MB book to the last page. */
export async function extractPdf(bytes: Uint8Array, maxChars = EXTRACT_MAX_CHARS): Promise<ExtractedPdf> {
  const proxy = await getDocumentProxy(bytes);
  const pdf = proxy as PdfJsDoc;
  const pageCount = Number(pdf.numPages) || 0;
  if (!pageCount) {
    throw new Error("This PDF has no extractable text.");
  }

  const labeled: string[] = [];
  let chars = 0;
  let hasBody = false;
  const limit = Math.max(1, maxChars);

  try {
    if (typeof pdf.getPage === "function") {
      for (let i = 1; i <= pageCount; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const body = pageBody(content.items ?? []);
        if (body) hasBody = true;
        labeled.push(`Page ${i}\n${body || "no text on this page"}`);
        chars += body.length;
        if (chars >= limit) break;
      }
    } else {
      const result = await extractText(proxy, { mergePages: false });
      const pages = Array.isArray(result.text) ? result.text : [result.text];
      for (const [index, page] of pages.entries()) {
        const body = (page ?? "").replace(/\s+/g, " ").trim();
        if (body) hasBody = true;
        labeled.push(`Page ${index + 1}\n${body || "no text on this page"}`);
        chars += body.length;
        if (chars >= limit) break;
      }
    }
  } finally {
    await pdf.destroy?.();
  }

  if (!hasBody) {
    throw new Error("This PDF has no extractable text.");
  }
  return { text: labeled.join("\n\n").trim(), pageCount };
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  return (await extractPdf(bytes)).text;
}
