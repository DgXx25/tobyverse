import { pageLabel } from "@/lib/rag/format";
import type { ChatSource, ChatSourceRef } from "@/types/chat";

export const SOURCE_SNIPPET_CHARS = 200;
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
  return [
    "Passages from the user's own materials, numbered. They are the primary basis for this answer when they are relevant.",
    "Cite the passage that supports a claim with its tag right after it, like [S2]. Use only numbers that exist below. Do not quote the tags otherwise and do not mention retrieval.",
    "If they do not cover what was asked, say that in one short line, then answer from general knowledge and make clear which part is not from their materials. Never invent page numbers.",
    passages,
  ].join("\n\n");
}

/** Citation numbers the reply actually used, ascending. */
export function citedNumbers(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(CITATION)) {
    for (const part of match[0].matchAll(/S(\d{1,2})/g)) found.add(Number(part[1]));
  }
  return [...found].sort((a, b) => a - b);
}

/** Turns [S2] / [S1, S3] into markdown links the renderer can recognise: [2](#toby-source-2). */
export function linkCitations(text: string): string {
  return text.replace(CITATION, (group) =>
    [...group.matchAll(/S(\d{1,2})/g)].map((part) => `[${part[1]}](#toby-source-${part[1]})`).join(""),
  );
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
