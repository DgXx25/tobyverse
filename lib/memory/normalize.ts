import { MEMORY_CONTENT_MAX, MEMORY_OPS_PER_TURN, PERSONALIZATION_MAX } from "@/lib/memory/constants";
import type { ChatMemoryContext, MemoryOp } from "@/types/memory";
import { containsSensitiveMemory, isWorkNoteRequest, memorySafeText } from "@/lib/memory/privacy";

export function sanitizeMemoryContent(value: unknown): string {
  if (typeof value !== "string" || !memorySafeText(value)) return "";
  const line = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!line) return "";
  return line.length <= MEMORY_CONTENT_MAX ? line : `${line.slice(0, MEMORY_CONTENT_MAX - 1).trim()}…`;
}

export function sanitizePersonalization(value: unknown): string {
  if (typeof value !== "string" || !memorySafeText(value)) return "";
  const text = value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return "";
  if (text.length <= PERSONALIZATION_MAX) return text;
  return text.slice(0, PERSONALIZATION_MAX).replace(/\s+\S*$/, "").trim() || text.slice(0, PERSONALIZATION_MAX);
}

export function memoryKey(content: string): string {
  return sanitizeMemoryContent(content).toLowerCase();
}

export function asMemoryFacts(value: unknown, cap: number): ChatMemoryContext[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const facts: ChatMemoryContext[] = [];
  for (const item of value) {
    if (facts.length >= cap) break;
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; content?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const content = sanitizeMemoryContent(row.content);
    if (!id || !content) continue;
    const key = memoryKey(content);
    if (seen.has(key) || seen.has(id)) continue;
    seen.add(key);
    seen.add(id);
    facts.push({ id, content });
  }
  return facts;
}

export function parsePersonalizationPatch(value: unknown, current: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as { personalization?: unknown };
  if (!("personalization" in row) || row.personalization == null) return undefined;
  const next = sanitizePersonalization(row.personalization);
  if (!next) return undefined;
  return next === current.trim() ? undefined : next;
}

const LEARNING_OR_MEMORY_SIGNAL =
  /remember|never forget|from now on|\balways\b|never (do|use|say|write)|დამიმახსოვრ|დაიმახსოვრ|ყოველთვის|არასდროს|დავიბენ|ვიბენ|მიჭირს|გაამარტივე|confused|overwhelmed|too (hard|abstract|long|fast)|simpler|slower|მაგალით|\bexamples?\b|ცხრილ|\btables?\b|ისტორი|\bstor(y|ies)\b|დამილისტ|don't just list|how I learn|როგორ ვსწავლ|clicked|helped me/i;

const DURABLE_FACT =
  /მე მქვია|my name is|ვმუშაობ|i work as|i(?:['’]m| am) an?\b|ფინალ.{0,48}(\d|რიცხვ)|exam.{0,24}(\d|on |date)|always (answer|write|reply) in|წერე? ქართულ|preferred language|B[12]\b|C[12]\b|A[12]\b|დონე|struggles with|მიჭირს|lecturer|ლექტორ|მანქიუ|mankiw|textbook|წიგნი|exam on|გამოცდა/i;

const PREFERENCE_MARKER = /\bi (?:prefer|like)\b|my prefer(?:red|ence)|მირჩევნია|მომწონს/i;
const COMMUNICATION_STYLE = /answers?|responses?|replies|paragraphs?|notes?|concise|detailed|emojis?|tone|format|bold|highlights?|მიპასუხ|პასუხებ|აბზაც|ჩანაწერ|მოკლე|ვრცელი|ემოჯ|გამუქ|სტილ/i;

function looksLikeQuestionOnly(prompt: string): boolean {
  const text = prompt.trim();
  if (/[?؟]\s*$/.test(text)) return true;
  return /^(რა |როდის |რითი |როგორ |რომელ |why |what |when |how |which )/i.test(text);
}

function isDocumentTask(prompt: string): boolean {
  return /^(?:please\s+)?(?:rewrite|translate|edit|proofread|summarize|format)\b|^(?:გადა(?:წერ|თარგმნ)|თარგმნ|შეასწორ|დაარედაქტირ|შეაჯამ)/i.test(prompt.trim());
}

/** Automatic learning stays quiet; a confirmation belongs only to a deliberate remember request. */
export function isExplicitMemoryRequest(prompt: string): boolean {
  if (containsSensitiveMemory(prompt) || isWorkNoteRequest(prompt) || isDocumentTask(prompt)) return false;
  return /\bremember\b|დაიმახსოვრ|დამიმახსოვრ/i.test(prompt);
}

/** Notes / practice / path requests have no signal — skip extract so they never show Memorized. */
export function shouldExtractMemory(prompt: string): boolean {
  if (containsSensitiveMemory(prompt) || isWorkNoteRequest(prompt) || isDocumentTask(prompt)) return false;
  const text = prompt.replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (LEARNING_OR_MEMORY_SIGNAL.test(text)) return true;
  if (PREFERENCE_MARKER.test(text) && COMMUNICATION_STYLE.test(text)) return true;
  if (looksLikeQuestionOnly(text)) return false;
  return DURABLE_FACT.test(text);
}

/** Compatibility grouping for descriptive preferences inside unified Memory. */
export function isStudyMethodMemory(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (/\b(always|never|from now on)\b/i.test(t) && /\b(answer|reply|respond|language|georgian|english|jargon)\b/i.test(t)) {
    return false;
  }
  return /\b(prefers?|likes?|tables?|examples?|stories|storytelling|confused|simpler|listing|how (they|the student) learn|study style|too (hard|abstract|long)|overwhelmed)\b/i.test(t)
    || /ცხრილ|მაგალით|ვიბენ|დავიბენ|მიჭირს|როგორ ვსწავლ/.test(t);
}

export function foldLearningSignal(current: string, signal: string): string {
  const next = signal.trim();
  if (!next) return sanitizePersonalization(current);
  const base = current.trim();
  if (!base) return sanitizePersonalization(next);
  if (base.toLowerCase().includes(next.toLowerCase())) return sanitizePersonalization(base);
  return sanitizePersonalization(`${base} ${next}`);
}

export function parseMemoryOps(value: unknown, knownIds: Set<string>): MemoryOp[] {
  if (!value || typeof value !== "object") return [];
  const row = value as { operations?: unknown };
  if (!Array.isArray(row.operations)) return [];

  const ops: MemoryOp[] = [];
  const seen = new Set<string>();

  for (const item of row.operations) {
    if (ops.length >= MEMORY_OPS_PER_TURN) break;
    if (!item || typeof item !== "object") continue;
    const next = item as { op?: unknown; id?: unknown; content?: unknown };
    if (next.op === "add") {
      const content = sanitizeMemoryContent(next.content);
      if (!content) continue;
      const key = `add:${memoryKey(content)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ops.push({ op: "add", content });
      continue;
    }
    if (next.op === "update") {
      const id = typeof next.id === "string" ? next.id.trim() : "";
      const content = sanitizeMemoryContent(next.content);
      if (!id || !knownIds.has(id) || !content) continue;
      const key = `id:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ops.push({ op: "update", id, content });
      continue;
    }
    if (next.op === "delete") {
      const id = typeof next.id === "string" ? next.id.trim() : "";
      if (!id || !knownIds.has(id)) continue;
      const key = `id:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ops.push({ op: "delete", id });
    }
  }

  return ops;
}
