import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { generateText } from "@/lib/ai/gemini";
import type { AiUsageReporter } from "@/types/billing";
import { chunkPages, chunkText, pagesFromMarkedText, type RagChunk, type SourcePage } from "@/lib/rag/chunk";
import { indexChunks, INDEX_VERSION } from "@/lib/rag/server";
import { openPdf } from "@/lib/materials/pdf";
import { previewText } from "@/lib/materials/limits";
import { downloadGcsObject, uploadGcsObject } from "@/lib/storage-gcs";

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
  /** UTF-8 bytes committed with the cursor; discards an uncommitted tail after a retry. */
  textBytes?: number;
  ocrPages?: number;
  version?: number;
};

function asState(value: unknown): IndexState {
  return value && typeof value === "object" ? (value as IndexState) : {};
}

async function ocrPage(image: Uint8Array, usage?: AiUsageReporter, scanned = true): Promise<string> {
  const text = await generateText(
    scanned
      ? "Read this document page for text search. Return two compact sections: Page text: transcribe readable text in reading order, preserving headings, paragraph breaks and table rows. Visual notes: briefly describe each meaningful chart, diagram, photograph or other figure and its key labels, values, objects or relationships. Do not guess unclear text or values; mark them [unclear]. Plain text only."
      : "This page already has selectable text. Inspect only embedded images, charts, diagrams, photographs or figures, and ignore ordinary page text. Return a compact section titled Embedded visuals: for each meaningful visual, transcribe legible labels or values and add one brief factual description of what it shows and its relationships or trend. Do not guess unclear text or values; mark them [unclear]. If the image contains a table, preserve its rows and columns. Plain text only.",
    { images: [{ mimeType: "image/png", data: Buffer.from(image).toString("base64") }], usage },
  );
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`Could not read or describe the visual on PDF page.`);
  return trimmed;
}

async function ocrMany(pages: { page: number; image: Uint8Array; scanned: boolean }[], usage?: AiUsageReporter): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(OCR_CONCURRENCY, pages.length) }, async () => {
    while (cursor < pages.length) {
      const item = pages[cursor];
      cursor += 1;
      out.set(item.page, await ocrPage(item.image, usage, item.scanned));
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
  const previousState = asState(data.index);
  // Older PDF indexes did not retain their full text. Re-read those pages before removing a binary.
  const state = typeof previousState.textBytes === "number" || data.originalRemoved === true ? previousState : {};
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

  const textPath = `${input.path.slice(0, input.path.lastIndexOf("/") + 1)}extracted.txt`;
  let committedText = Buffer.alloc(0);
  if ((state.textBytes ?? 0) > 0) {
    const saved = await downloadGcsObject(textPath);
    if (saved.buffer.byteLength < state.textBytes!) throw new Error("Saved PDF text is incomplete. The original has been kept.");
    committedText = Buffer.from(saved.buffer.subarray(0, state.textBytes));
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

      const visualPages = read.filter((item) => item.image && (item.scanned || item.hasImages));
      const allowed = visualPages.slice(0, Math.max(0, OCR_PAGE_CAP - ocrPages));
      const ocr = allowed.length
        ? await ocrMany(allowed.map((item) => ({ page: item.page, image: item.image as Uint8Array, scanned: item.scanned })), input.usage)
        : new Map<number, string>();
      ocrPages += allowed.length;

      const pages: SourcePage[] = read
        .map((item) => {
          const visualText = ocr.get(item.page)?.trim();
          const pageText = item.scanned ? (visualText ?? "") : item.text;
          return { page: item.page, text: visualText && !item.scanned ? `${pageText}\n\n${visualText}` : pageText };
        })
        .filter((item) => item.text.trim().length > 0);

      const windowChunks = chunkPages(pages, page);
      const windowText = pages.map(item => `Page ${item.page}\n${item.text}`).join("\n\n");
      const nextText = windowText ? Buffer.concat([committedText, Buffer.from(`${committedText.length ? "\n\n" : ""}${windowText}`, "utf8")]) : committedText;
      // Persist before advancing the cursor. A retry starts at the last committed byte offset.
      await uploadGcsObject(textPath, nextText, "text/plain; charset=utf-8");
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
          textPath,
          extractedPath: textPath,
          extractedTextPreview: firstPreview,
          images: [],
          hasImages: false,
          index: {
            status: finished ? "ready" : "indexing",
            nextPage: page,
            chunks,
            textChars,
            textBytes: nextText.byteLength,
            ocrPages,
            version: INDEX_VERSION,
          },
          status: finished ? "ready" : "processing",
          indexedAt: finished ? FieldValue.serverTimestamp() : null,
        },
        { merge: true },
      );
      committedText = Buffer.from(nextText);
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
