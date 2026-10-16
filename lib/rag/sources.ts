import { pageLabel } from "@/lib/rag/format";
import type { ChatSource, ChatSourceRef } from "@/types/chat";

export const SOURCE_SNIPPET_CHARS = 200;
export const MATERIALS_BASIS = "User materials are the primary basis when relevant.";
const CITATION = /\[(?:S\d{1,2})(?:\s*[,;]\s*S\d{1,2})*\]/g;

type Retrieved = {
  materialId: string;
  title: string;
  page: number;
  pageEnd: number;
  section: string;
  text: string;
};

/** Numbers retrieved chunks 1..n in the order the model will read them. */
export function numberSources(chunks: Retrieved[]): ChatSource[] {
  return chunks.map((chunk, index) => ({
    n: index + 1,
    materialId: chunk.materialId,
    title: chunk.title,
    page: chunk.page,
    pageEnd: chunk.pageEnd,
    section: chunk.section,
    text: chunk.text,
  }));
}

export function sourceRef(source: ChatSource): ChatSourceRef {
  const { text, ...rest } = source;
  return { ...rest, snippet: text.replace(/\s+/g, " ").trim().slice(0, SOURCE_SNIPPET_CHARS) };
}

export function sourceLocator(source: Pick<ChatSource, "page" | "pageEnd">): string {
  return source.page > 0 ? pageLabel(source.page, source.pageEnd) : "";
}

/** The block injected into the system prompt. Kept compact: the passages are the payload. */
export function formatSourcesBlock(sources: ChatSource[]): string {
  if (sources.length === 0) return "";
  const passages = sources
    .map((source) => {
      const where = [source.title, sourceLocator(source), source.section].filter(Boolean).join(" · ");
      return `[S${source.n}] ${where}\n${source.text}`;
    })
    .join("\n\n");
  return `${MATERIALS_BASIS}\n\n${passages}`;
}

/** Citation numbers the reply actually used, ascending. */
export function citedNumbers(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(CITATION)) {
    for (const part of match[0].matchAll(/S(\d{1,2})/g)) found.add(Number(part[1]));
  }
  return [...found].sort((a, b) => a - b);
}

/** Turns [S2] / [S1, S3] into nothing. Source numbers are not shown in the answer. */
export function linkCitations(text: string): string {
  return text.replace(CITATION, "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1");
}

export function sourceNumberFromHref(href?: string | null): number | null {
  const match = href?.match(/^#toby-source-(\d{1,2})$/);
  return match ? Number(match[1]) : null;
}

/** Keeps only sources the reply cited. If it cited none, keeps them all so the user can still check. */
export function usedSources(text: string, sources: ChatSourceRef[]): ChatSourceRef[] {
  const cited = new Set(citedNumbers(text));
  const used = sources.filter((source) => cited.has(source.n));
  return used.length > 0 ? used : sources;
}

/** A short follow-up ("and the second one?") is useless alone, so borrow the previous question. */
export function retrievalQuery(prompt: string, history: { role: string; content: string }[]): string {
  const current = prompt.trim();
  if (current.length >= 60) return current;
  const previous = [...history].reverse().find((turn) => turn.role === "user" && turn.content.trim() && turn.content.trim() !== current);
  return previous ? `${previous.content.trim().slice(0, 300)}\n${current}` : current;
}
