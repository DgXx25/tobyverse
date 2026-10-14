import { parseTobyFence } from "@/lib/blocks/registry";
import { splitCodeFences } from "@/lib/visuals/math";
import type { PaperPayload } from "@/types/exercise";

function asGiven(value: unknown): PaperPayload["given"] {
  if (!value || typeof value !== "object") return undefined;
  const to = (value as { to?: unknown }).to;
  return typeof to === "string" ? { to } : undefined;
}

function asSample(value: unknown): PaperPayload["sample"] {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const sample = {
    to: typeof row.to === "string" ? row.to : undefined,
    body: typeof row.body === "string" ? row.body : undefined,
    sign: typeof row.sign === "string" ? row.sign : undefined,
    date: typeof row.date === "string" ? row.date : undefined,
  };
  if (!sample.to && !sample.body && !sample.sign && !sample.date) return undefined;
  return sample;
}

function asRubric(value: unknown): PaperPayload["rubric"] {
  if (!Array.isArray(value)) return undefined;
  const rubric = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { criterion?: unknown; weight?: unknown };
    if (typeof row.criterion !== "string") return [];
    return [{ criterion: row.criterion, weight: typeof row.weight === "number" ? row.weight : 0 }];
  });
  return rubric.length ? rubric : undefined;
}

export function isPaperReuse(data: unknown): boolean {
  return Boolean(data && typeof data === "object" && (data as { reuse?: unknown }).reuse === true);
}

/** Stored sheet from a fence — skips reuse stubs so they are not a source. */
export function paperFromBlockData(data: unknown): PaperPayload | null {
  if (!data || typeof data !== "object" || isPaperReuse(data)) return null;
  const row = data as Record<string, unknown>;
  const brief = typeof row.brief === "string" ? row.brief : "";
  if (!brief && row.form !== "ganckhadeba") return null;
  return {
    form: "ganckhadeba",
    brief,
    given: asGiven(row.given),
    sample: asSample(row.sample),
    rubric: asRubric(row.rubric),
  };
}

export function papersInText(text: string): PaperPayload[] {
  if (!text.trim()) return [];
  const out: PaperPayload[] = [];
  for (const part of splitCodeFences(text)) {
    if (part.kind !== "fence") continue;
    const parsed = parseTobyFence(part.lang, part.text);
    if (!parsed || parsed.type !== "paper") continue;
    const paper = paperFromBlockData(parsed.data);
    if (paper) out.push(paper);
  }
  return out;
}

export function papersInTurns(turns: Array<{ role?: string; content?: string }>): PaperPayload[] {
  const out: PaperPayload[] = [];
  for (const turn of turns) {
    if (turn.role && turn.role !== "assistant") continue;
    if (!turn.content) continue;
    out.push(...papersInText(turn.content));
  }
  return out;
}

function tryBrief(brief: string): string {
  return brief.replace(/^მაგალითი\s*[—\-–:]\s*/i, "").trim() || brief;
}

/** Reuse opens a fresh fillable sheet from the last paper. Sample stays on the old example. */
export function resolvePaperPayload(data: unknown, prior: PaperPayload[]): PaperPayload | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (isPaperReuse(data)) {
    const last = prior[prior.length - 1];
    if (!last) {
      const brief = typeof row.brief === "string" ? row.brief : "";
      return { form: "ganckhadeba", brief };
    }
    return {
      form: last.form,
      brief: tryBrief(last.brief),
      given: last.given,
      rubric: last.rubric,
    };
  }
  return (
    paperFromBlockData(data) ?? {
      form: "ganckhadeba",
      brief: typeof row.brief === "string" ? row.brief : "",
    }
  );
}
