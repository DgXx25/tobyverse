import { extractText, getDocumentProxy } from "unpdf";

export type ExtractedPdf = {
  text: string;
  pageCount: number;
};

export async function extractPdf(bytes: Uint8Array): Promise<ExtractedPdf> {
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(result.text) ? result.text : [result.text];
  const labeled = pages.map((page, index) => {
    const body = (page ?? "").replace(/\s+\n/g, "\n").trim();
    return `Page ${index + 1}\n${body || "no text on this page"}`;
  });
  const text = labeled.join("\n\n").trim();
  const hasBody = pages.some((page) => (page ?? "").trim().length > 0);
  if (!hasBody) {
    throw new Error("This PDF has no extractable text.");
  }
  return { text, pageCount: result.totalPages || pages.length };
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  return (await extractPdf(bytes)).text;
}
