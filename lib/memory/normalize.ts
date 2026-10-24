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

const DURABLE_FACT =
  /მე მქვია|მე ვარ|მე ვსწავლობ|ჩემი (?:მიზან|გამოცდ|პროფეს|დონე|სახელ)|ვმუშაობ|my name is|\bi work as\b|\bi (?:study|speak|live in|learn|prefer)\b|\bi(?:['’]m| am) (?:an? |studying|learning|based in)|\bmy (?:goal|exam|course|preferred|learning|accessibility|device|name)\b|always (answer|write|reply) in|წერე? ქართულ|preferred language|მირჩევნია|ვსწავლობ|გამოცდა (?:მაქვს|მექნება)/i;

const PREFERENCE_MARKER = /\bi (?:prefer|like)\b|my prefer(?:red|ence)|მირჩევნია|მომწონს/i;
const COMMUNICATION_STYLE = /answers?|responses?|replies|paragraphs?|notes?|concise|detailed|emojis?|tone|format|bold|highlights?|მიპასუხ|პასუხებ|აბზაც|ჩანაწერ|მოკლე|ვრცელი|ემოჯ|გამუქ|სტილ/i;

/** Direct response rules and durable style preferences apply across topics. */
export function isStandingResponseInstruction(value: unknown): boolean {
  const text = sanitizeMemoryContent(value);
  if (!text) return false;
  if (/^(?:prefers?|preferred|speaks?)\b.*(?:answers?|responses?|language|paragraph|georgian|english|concise|detailed)/i.test(text)) return true;
  if (PREFERENCE_MARKER.test(text) && COMMUNICATION_STYLE.test(text)) return true;
  const englishDirective = /^(?:always\s+|never\s+|from now on\s+)?(?:reply|answer|respond|write|keep|use)\b/i.test(text);
  const georgianDirective = /^(?:ყოველთვის\s+|არასდროს\s+)?(?:მიპასუხ|პასუხ|წერე|გამოიყენე|არ გამოიყენო)/i.test(text);
  return (englishDirective || georgianDirective) && COMMUNICATION_STYLE.test(text);
}

function looksLikeQuestionOnly(prompt: string): boolean {
  const text = prompt.trim();
  if (/[?؟]\s*$/.test(text)) return true;
  return /^(რა |როდის |რითი |როგორ |რომელ |why |what |when |how |which )/i.test(text);
}

function isDocumentTask(prompt: string): boolean {
  return /^(?:please\s+)?(?:rewrite|translate|edit|proofread|summarize|format)\b|^(?:გადა(?:წერ|თარგმნ)|თარგმნ|შეასწორ|დაარედაქტირ|შეაჯამ)/i.test(prompt.trim());
}

/** Automatic learning stays quiet; a confirmation belongs only to a deliberate remember request. */
export function isForgetAllMemoryRequest(prompt: string): boolean {
  const text = prompt.replace(/\s+/g, " ").trim();
  return /^(?:please[, ]+)?(?:forget (?:everything (?:you (?:know|remember) )?about me|all (?:my |your )?memories)|(?:clear|delete|remove) (?:all )?(?:my |your )?(?:personal )?memor(?:y|ies))[.!?]*$/i.test(text)
    || /^(?:გთხოვ[,\s]+)?(?:ჩემი )?(?:მთელი|ყველა) (?:პირადი )?მეხსიერებ[ა-ჰ]* (?:წაშალე|გაასუფთავე)[.!?]*$/.test(text);
}

export function isExplicitMemoryRequest(prompt: string): boolean {
  if (containsSensitiveMemory(prompt) || isWorkNoteRequest(prompt) || isDocumentTask(prompt)) return false;
  const text = prompt.replace(/\s+/g, " ").trim();
  if (isForgetAllMemoryRequest(text)) return true;
  if (/\bremember\b|\bforget\b|\bclear (?:all )?(?:my |your )?memory\b|დაიმახსოვრ|დამიმახსოვრ|დაივიწყე|მეხსიერებ.{0,20}(?:წაშალე|გაასუფთავე)/i.test(text)) return true;
  const persistent = /\bfrom now on\b|\balways\b|\bnever\b|ამიერიდან|ყოველთვის|არასდროს/i.test(text);
  const generalPreference = PREFERENCE_MARKER.test(text) && COMMUNICATION_STYLE.test(text)
    && !/\bfor this (?:answer|reply|question|comparison|explanation|task)\b|ამ (?:პასუხ|შედარებ|ახსნ|კითხვ)[^\n]{0,24}(?:თვის|ში)/i.test(text);
  return (persistent && COMMUNICATION_STYLE.test(text)) || generalPreference;
}

/** Notes / practice / path requests have no signal — skip extract so they never show Memorized. */
export function shouldExtractMemory(prompt: string): boolean {
  if (containsSensitiveMemory(prompt) || isWorkNoteRequest(prompt) || isDocumentTask(prompt)) return false;
  const text = prompt.replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (isExplicitMemoryRequest(text)) return true;
  if (/\bfor this (?:answer|reply|question|comparison|explanation|task)\b|ამ (?:პასუხ|შედარებ|ახსნ|კითხვ)[^\n]{0,24}(?:თვის|ში)/i.test(text)) return false;
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

export function parseMemoryOps(value: unknown, knownIds: Set<string>, maxOperations = MEMORY_OPS_PER_TURN): MemoryOp[] {
  if (!value || typeof value !== "object") return [];
  const row = value as { operations?: unknown };
  if (!Array.isArray(row.operations)) return [];

  const ops: MemoryOp[] = [];
  const seen = new Set<string>();

  for (const item of row.operations) {
    if (ops.length >= maxOperations) break;
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
