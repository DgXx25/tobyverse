import { chunkTerms, estimateTokens, isGeorgian } from "@/lib/rag/tokens";

export type SourcePage = {
  /** 1-based page or slide number. Use 0 when the format has no pages. */
  page: number;
  text: string;
};

export type RagChunk = {
  /** Stable, sortable id: document order == lexicographic order. */
  id: string;
  page: number;
  pageEnd: number;
  /** Nearest heading above the chunk. */
  section: string;
  text: string;
  terms: string[];
  tokens: number;
};

export const CHUNK_TARGET_TOKENS = 450;
export const CHUNK_MAX_TOKENS = 650;
export const CHUNK_OVERLAP_TOKENS = 60;
const MIN_TAIL_TOKENS = 110;

type Unit = { text: string; page: number; section: string; heading: boolean; tokens: number };

const HEADING_PATTERNS = [
  /^(?:chapter|part|section|unit|lesson|appendix)\s+[\divxlc]+\b/i,
  /^(?:თავი|ნაწილი|პარაგრაფი|ლექცია|დანართი)\s*[\d.ivxlc]+/iu,
  /^\d+(?:\.\d+){0,3}[.)]?\s+\p{L}/u,
  /^slide\s+\d+/i,
];

function looksLikeHeading(line: string): boolean {
  const text = line.trim();
  if (text.length < 3 || text.length > 100) return false;
  if (/[.!?;,:…]$/.test(text)) return false;
  if (HEADING_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 5 && !isGeorgian(letters)) {
    const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
    if (upper / letters.length > 0.85) return true;
  }
  return false;
}

/** Split a block into sentence-ish pieces without losing text. */
function sentences(block: string): string[] {
  const parts = block.split(/(?<=[.!?։…])\s+(?=[\p{Lu}\p{N}"«„(\u10A0-\u10FF])/u);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function hardSplit(text: string, maxTokens: number): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (estimateTokens(current.join(" ")) >= maxTokens) {
      out.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) out.push(current.join(" "));
  return out;
}

function toUnits(pages: SourcePage[]): Unit[] {
  const units: Unit[] = [];
  let section = "";
  for (const page of pages) {
    const text = page.text.replace(/\r\n?/g, "\n").replace(/[ \t\f\v]+/g, " ");
    const blocks = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    // PDF text layers often arrive as one long line. Join soft-wrapped lines of a paragraph
    // back together, but keep short lines (likely headings, list items) on their own.
    const paragraphs: string[] = [];
    for (const line of blocks) {
      const previous = paragraphs[paragraphs.length - 1];
      if (
        previous !== undefined &&
        !looksLikeHeading(previous) &&
        !looksLikeHeading(line) &&
        !/[.!?։…:]$/.test(previous) &&
        previous.length > 50
      ) {
        paragraphs[paragraphs.length - 1] = `${previous} ${line}`;
      } else {
        paragraphs.push(line);
      }
    }
    for (const paragraph of paragraphs) {
      if (looksLikeHeading(paragraph)) {
        section = paragraph.slice(0, 120);
        units.push({ text: paragraph, page: page.page, section, heading: true, tokens: estimateTokens(paragraph) });
        continue;
      }
      for (const sentence of sentences(paragraph)) {
        for (const piece of hardSplit(sentence, CHUNK_MAX_TOKENS - 40)) {
          units.push({ text: piece, page: page.page, section, heading: false, tokens: estimateTokens(piece) });
        }
      }
    }
  }
  return units;
}

function joinUnits(units: Unit[]): string {
  let out = "";
  for (const unit of units) {
    if (!out) out = unit.text;
    else out += unit.heading ? `\n\n${unit.text}\n` : ` ${unit.text}`;
  }
  return out.trim();
}

export function chunkId(window: number, index: number): string {
  return `c${String(Math.max(0, window)).padStart(5, "0")}-${String(index).padStart(4, "0")}`;
}

/**
 * Structure-aware chunking. Breaks at sentence boundaries, starts a fresh chunk at a heading,
 * carries a small overlap, and never emits a tiny tail. Deterministic: same input, same ids,
 * so a retried indexing run overwrites instead of duplicating.
 *
 * `window` namespaces the ids when a long document is indexed in several runs.
 */
export function chunkPages(pages: SourcePage[], window = 0): RagChunk[] {
  const units = toUnits(pages);
  const chunks: RagChunk[] = [];
  let current: Unit[] = [];
  let currentTokens = 0;
  let carry: Unit[] = [];

  const flush = () => {
    const body = current.filter((unit) => !carry.includes(unit));
    if (body.length === 0) {
      current = [];
      currentTokens = 0;
      return;
    }
    const text = joinUnits(current);
    const first = body[0];
    const last = body[body.length - 1];
    chunks.push({
      id: chunkId(window, chunks.length),
      page: first.page,
      pageEnd: last.page,
      section: first.heading ? first.text.slice(0, 120) : first.section,
      text,
      // The heading is searchable too ("chapter 5" should find the chunk under that heading).
      terms: chunkTerms(`${first.heading ? first.text : first.section}\n${text}`),
      tokens: estimateTokens(text),
    });
    // Overlap: re-seed the next chunk with this chunk's tail (sentences only, never headings).
    const tail: Unit[] = [];
    let tailTokens = 0;
    for (let i = body.length - 1; i >= 0; i -= 1) {
      const unit = body[i];
      if (unit.heading) break;
      if (tailTokens + unit.tokens > CHUNK_OVERLAP_TOKENS) break;
      tail.unshift(unit);
      tailTokens += unit.tokens;
    }
    carry = tail;
    current = [...tail];
    currentTokens = tailTokens;
  };

  for (const unit of units) {
    const bodyTokens = currentTokens - carry.reduce((sum, item) => sum + item.tokens, 0);
    if (current.length > 0 && unit.heading && bodyTokens >= CHUNK_TARGET_TOKENS * 0.4) {
      carry = [];
      flush();
      current = [];
      currentTokens = 0;
      carry = [];
    }
    if (current.length > 0 && currentTokens + unit.tokens > CHUNK_MAX_TOKENS) flush();
    current.push(unit);
    currentTokens += unit.tokens;
    if (currentTokens >= CHUNK_TARGET_TOKENS && !unit.heading) flush();
  }
  flush();

  // Fold a tiny trailing chunk into its predecessor when the pair still fits.
  if (chunks.length >= 2) {
    const tail = chunks[chunks.length - 1];
    const before = chunks[chunks.length - 2];
    if (tail.tokens < MIN_TAIL_TOKENS && before.tokens + tail.tokens <= CHUNK_MAX_TOKENS + 80) {
      const text = `${before.text}\n\n${tail.text}`;
      chunks.splice(chunks.length - 2, 2, {
        ...before,
        pageEnd: tail.pageEnd,
        text,
        terms: chunkTerms(text),
        tokens: estimateTokens(text),
      });
    }
  }
  return chunks;
}

/** Plain text with no page structure (txt, docx, md, notes). Page stays 0. */
export function chunkText(text: string, window = 0): RagChunk[] {
  return chunkPages([{ page: 0, text }], window);
}

/**
 * pptx extractors emit slide text in order; recover slide numbers from `Slide N` style markers
 * when present, otherwise fall back to a single unpaged run.
 */
export function pagesFromMarkedText(text: string): SourcePage[] {
  const pattern = /^(?:slide|page|გვერდი|სლაიდი)\s+(\d+)\s*[:.\-–]?\s*$/gimu;
  const marks: { page: number; index: number; length: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    marks.push({ page: Number(match[1]), index: match.index, length: match[0].length });
  }
  if (marks.length < 2) return [{ page: 0, text }];
  const pages: SourcePage[] = [];
  const head = text.slice(0, marks[0].index).trim();
  if (head) pages.push({ page: 0, text: head });
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(mark.index + mark.length, end).trim();
    if (body) pages.push({ page: mark.page, text: body });
  });
  return pages;
}
