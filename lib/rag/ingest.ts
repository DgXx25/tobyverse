import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { generateText } from "@/lib/ai/gemini";
import type { AiUsageReporter } from "@/types/billing";
import { chunkPages, chunkText, pagesFromMarkedText, type RagChunk, type SourcePage } from "@/lib/rag/chunk";
import { indexChunks, INDEX_VERSION } from "@/lib/rag/server";
import { openPdf } from "@/lib/materials/pdf";
import { previewText } from "@/lib/materials/limits";
import { downloadGcsObject } from "@/lib/storage-gcs";

/**
 * Resumable, idempotent indexing. Every call does as much as its time budget allows, then
 * persists a cursor on the material doc so the client simply calls again until `done`.
 * Chunk ids are deterministic, so a retried window overwrites itself instead of duplicating.
 */

export type IndexProgress = {
  done: boolean;
  pageCount: number;
  nextPage: number;
  chunks: number;
  textChars: number;
  preview: string;
};

const PDF_WINDOW_PAGES = 25;
const OCR_CONCURRENCY = 4;
const OCR_PAGE_CAP = 400;
const TEXT_EMBED_PER_STEP = 200;

type IndexState = {
  status?: string;
  nextPage?: number;
  chunks?: number;
  total?: number;
  textChars?: number;
  ocrPages?: number;
  version?: number;
};

function asState(value: unknown): IndexState {
  return value && typeof value === "object" ? (value as IndexState) : {};
}

async function ocrPage(image: Uint8Array, usage?: AiUsageReporter): Promise<string> {
  try {
    const text = await generateText(
      "Transcribe all readable text on this page in reading order. Keep headings and paragraph breaks. Plain text only, no commentary. If a diagram has labels, list the labels. If the page is blank, return nothing.",
      { images: [{ mimeType: "image/png", data: Buffer.from(image).toString("base64") }], usage },
    );
    return text.trim();
  } catch {
    return "";
  }
}

async function ocrMany(pages: { page: number; image: Uint8Array }[], usage?: AiUsageReporter): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(OCR_CONCURRENCY, pages.length) }, async () => {
    while (cursor < pages.length) {
      const item = pages[cursor];
      cursor += 1;
      out.set(item.page, await ocrPage(item.image, usage));
    }
  });
  await Promise.all(workers);
  return out;
}

export async function indexPdfStep(input: {
  uid: string;
  projectId: string;
  materialId: string;
  path: string;
  ref: DocumentReference;
  budgetMs: number;
  usage?: AiUsageReporter;
}): Promise<IndexProgress> {
  const started = Date.now();
  const snapshot = await input.ref.get();
  const data = snapshot.data() ?? {};
  const state = asState(data.index);
  const preview = typeof data.extractedTextPreview === "string" ? data.extractedTextPreview : "";
  const pageCountBefore = typeof data.pageCount === "number" ? data.pageCount : 0;

  if (state.status === "ready" && state.version === INDEX_VERSION) {
    return {
      done: true,
      pageCount: pageCountBefore,
      nextPage: pageCountBefore + 1,
      chunks: state.chunks ?? 0,
      textChars: state.textChars ?? 0,
      preview,
    };
  }

  const { buffer } = await downloadGcsObject(input.path);
  const pdf = await openPdf(new Uint8Array(buffer));
  try {
    let page = Math.max(1, state.nextPage ?? 1);
    let chunks = state.chunks ?? 0;
    let textChars = state.textChars ?? 0;
    let ocrPages = state.ocrPages ?? 0;
    let firstPreview = preview;

    while (page <= pdf.pageCount && (page === (state.nextPage ?? 1) || Date.now() - started < input.budgetMs)) {
      const end = Math.min(pdf.pageCount, page + PDF_WINDOW_PAGES - 1);
      const read = await pdf.readPages(page, end);

      const scans = read.filter((item) => item.scanned && item.image);
      const allowed = scans.slice(0, Math.max(0, OCR_PAGE_CAP - ocrPages));
      const ocr = allowed.length
        ? await ocrMany(allowed.map((item) => ({ page: item.page, image: item.image as Uint8Array })), input.usage)
        : new Map<number, string>();
      ocrPages += allowed.length;

      const pages: SourcePage[] = read
        .map((item) => ({ page: item.page, text: item.scanned ? (ocr.get(item.page) ?? "") : item.text }))
        .filter((item) => item.text.trim().length > 0);

      const windowChunks = chunkPages(pages, page);
      await indexChunks({ uid: input.uid, projectId: input.projectId, materialId: input.materialId, chunks: windowChunks });
      chunks += windowChunks.length;
      textChars += pages.reduce((sum, item) => sum + item.text.length, 0);
      if (!firstPreview && pages[0]) firstPreview = previewText(pages[0].text);

      page = end + 1;
      const finished = page > pdf.pageCount;
      await input.ref.set(
        {
          pageCount: pdf.pageCount,
          textChars,
          extractedTextPreview: firstPreview,
          images: [],
          hasImages: false,
          index: {
            status: finished ? "ready" : "indexing",
            nextPage: page,
            chunks,
            textChars,
            ocrPages,
            version: INDEX_VERSION,
          },
          status: finished ? "ready" : "processing",
          indexedAt: finished ? FieldValue.serverTimestamp() : null,
        },
        { merge: true },
      );
    }

    return {
      done: page > pdf.pageCount,
      pageCount: pdf.pageCount,
      nextPage: page,
      chunks,
      textChars,
      preview: firstPreview,
    };
  } finally {
    await pdf.close();
  }
}

function chunksFromText(text: string): RagChunk[] {
  const pages = pagesFromMarkedText(text);
  return pages.length > 1 ? chunkPages(pages, 0) : chunkText(text, 0);
}

/** Text, DOCX, PPTX, sheets, images, paste and URL: all land as plain text at `textPath` first. */
export async function indexTextStep(input: {
  uid: string;
  projectId: string;
  materialId: string;
  textPath: string;
  ref: DocumentReference;
  budgetMs: number;
}): Promise<{ done: boolean; chunks: number; total: number; textChars: number }> {
  const started = Date.now();
  const snapshot = await input.ref.get();
  const data = snapshot.data() ?? {};
  const state = asState(data.index) as IndexState & { nextChunk?: number };
  if (state.status === "ready" && state.version === INDEX_VERSION) {
    return { done: true, chunks: state.chunks ?? 0, total: state.total ?? state.chunks ?? 0, textChars: state.textChars ?? 0 };
  }

  const { buffer } = await downloadGcsObject(input.textPath);
  const text = buffer.toString("utf8");
  const all = chunksFromText(text);
  let cursor = Math.max(0, state.nextChunk ?? 0);

  while (cursor < all.length && (cursor === (state.nextChunk ?? 0) || Date.now() - started < input.budgetMs)) {
    const slice = all.slice(cursor, cursor + TEXT_EMBED_PER_STEP);
    await indexChunks({ uid: input.uid, projectId: input.projectId, materialId: input.materialId, chunks: slice });
    cursor += slice.length;
    const finished = cursor >= all.length;
    await input.ref.set(
      {
        textChars: text.length,
        index: {
          status: finished ? "ready" : "indexing",
          nextChunk: cursor,
          chunks: cursor,
          total: all.length,
          textChars: text.length,
          version: INDEX_VERSION,
        },
      },
      { merge: true },
    );
  }

  if (all.length === 0) {
    await input.ref.set(
      { index: { status: "ready", chunks: 0, total: 0, textChars: text.length, version: INDEX_VERSION } },
      { merge: true },
    );
  }
  return { done: cursor >= all.length, chunks: cursor, total: all.length, textChars: text.length };
}
