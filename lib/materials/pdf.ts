import { getDocumentProxy, renderPageAsImage } from "unpdf";

export type ExtractedPdfPage = {
  page: number;
  text: string;
  /** True when the page has no text layer (a scan). OCR is the caller's decision. */
  scanned: boolean;
  /** PNG bytes, only for scanned pages, so the caller can OCR them. */
  image?: Uint8Array;
};

export type ExtractedPdf = { text: string; pageCount: number };

type PdfJsItem = { str?: string; hasEOL?: boolean };
type PdfJsPage = { getTextContent: () => Promise<{ items: PdfJsItem[] }>; cleanup?: () => void };
type PdfJsDoc = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy?: () => Promise<unknown>;
};

/** Keeps line breaks (pdf.js marks them with hasEOL) so chunking can see paragraphs and headings. */
function pageBody(items: PdfJsItem[]): string {
  let out = "";
  for (const item of items) {
    const text = item.str ?? "";
    out += text;
    if (item.hasEOL) out += "\n";
    else if (text && !text.endsWith(" ")) out += " ";
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type OpenPdf = {
  pageCount: number;
  /** Reads pages [start, end] inclusive. Scanned pages come back flagged with a raster for OCR. */
  readPages: (start: number, end: number, options?: { rasterScale?: number }) => Promise<ExtractedPdfPage[]>;
  close: () => Promise<void>;
};

/**
 * Parses the PDF once. Callers that walk many pages must reuse this instead of re-parsing
 * the whole file for every batch.
 */
export async function openPdf(bytes: Uint8Array): Promise<OpenPdf> {
  const proxy = await getDocumentProxy(bytes);
  const pdf = proxy as unknown as PdfJsDoc;
  const pageCount = Number(pdf.numPages) || 0;
  if (!pageCount) {
    await pdf.destroy?.();
    throw new Error("This PDF has no pages.");
  }
  return {
    pageCount,
    async readPages(start, end, options) {
      const from = Math.max(1, Math.floor(start));
      const to = Math.min(pageCount, Math.floor(end));
      const pages: ExtractedPdfPage[] = [];
      for (let number = from; number <= to; number += 1) {
        const page = await pdf.getPage(number);
        const text = pageBody((await page.getTextContent()).items ?? []);
        page.cleanup?.();
        if (text.length >= 8) {
          pages.push({ page: number, text, scanned: false });
          continue;
        }
        let image: Uint8Array | undefined;
        try {
          image = new Uint8Array(
            await renderPageAsImage(proxy, number, { scale: options?.rasterScale ?? 1.5, toDataURL: false }),
          );
        } catch {
          image = undefined;
        }
        pages.push({ page: number, text: "", scanned: true, image });
      }
      return pages;
    },
    async close() {
      await pdf.destroy?.();
    },
  };
}

/** Compact compatibility preview only. Retrieval uses the chunk index, never this value. */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractedPdf> {
  const pdf = await openPdf(bytes);
  try {
    const [first] = await pdf.readPages(1, 1);
    return { text: `Page 1\n${first?.text || "no text on page 1"}`, pageCount: pdf.pageCount };
  } finally {
    await pdf.close();
  }
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  return (await extractPdf(bytes)).text;
}
