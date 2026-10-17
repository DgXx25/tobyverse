import {
  type ChatToolCall,
  type ChatToolName,
} from "@/lib/ai/tools";
import { isFormWriteTopic } from "@/lib/exercises/plan";
import { isSimpleChatTask } from "@/lib/blocks/match";
import type { AcceptedChatTool, PendingKind } from "@/types/chat";

export const COMPOSER_INTENTS = [
  "ask",
  "plan",
  "study",
  "practice",
  "edit",
  "append",
  "regenerate_one",
  "rewrite_sheet",
] as const;

export type ComposerIntent = (typeof COMPOSER_INTENTS)[number];

export type ToolIntent = "plan" | "study" | "practice";

export type MutationIntent = "edit" | "append" | "regenerate_one" | "rewrite_sheet";

export type RouteSpecificity = "broad" | "specific";

export const COMPOSER_INTENT_LABELS: Record<ComposerIntent, string> = {
  ask: "Ask",
  plan: "Plan",
  study: "Study",
  practice: "Quiz",
  edit: "Edit",
  append: "Append",
  regenerate_one: "Replace item",
  rewrite_sheet: "Rewrite sheet",
};

export const DEFAULT_COMPOSER_INTENT: ComposerIntent = "ask";

export function isComposerIntent(value: unknown): value is ComposerIntent {
  return typeof value === "string" && (COMPOSER_INTENTS as readonly string[]).includes(value);
}

export function isToolIntent(value: unknown): value is ToolIntent {
  return value === "practice" || value === "study" || value === "plan";
}

export function isMutationIntent(value: unknown): value is MutationIntent {
  return value === "edit" || value === "append" || value === "regenerate_one" || value === "rewrite_sheet";
}

const FILLERS = new Set([
  "i",
  "me",
  "my",
  "a",
  "an",
  "the",
  "to",
  "for",
  "in",
  "on",
  "of",
  "and",
  "please",
  "want",
  "wanna",
  "some",
  "do",
  "make",
  "get",
  "about",
  "with",
  "let",
  "lets",
  "add",
  "show",
  "find",
  "see",
  "looking",
  "interested",
  "მინდა",
  "გთხოვ",
  "რომ",
  "მაინტერესებს",
]);

const TOPIC_STRIP = [
  "დამავარჯიშე",
  "გამომცადე",
  "გამოცდა",
  "ვივარჯიშო",
  "ვარჯიში",
  "exam",
  "quiz me",
  "test me",
  "practice",
  "quiz",
  "შემომაჯამე",
  "შემაჯამე",
  "study sheet",
  "summarize",
  "study path",
  "course path",
  "syllabus",
  "სილაბუსი",
  "კურსის გზა",
  "შექმენი",
  "დამიწერე",
  "დაწერე",
  "გააკეთე",
  "write me",
  "create",
  "გაამარტივე",
  "შეამოკლე",
  "simplify",
  "shorten",
  "დაამატე",
  "add more",
];

const GENERATE_NOW =
  /რაც გინდა|რაც მოგივა|დააგენერირე|გენერირება|\bსულ\b|just generate|generate (it|now|anyway)|whatever|random\b|any(thing)? (is )?fine|don't care|dont care|up to you|i don't mind/i;
const ACCEPT_OFFER = /^(დიახ|კი|ხო|კარგი|ოკ|ok|okay|yes|yep|sure)\.?!?$/i;

const DO_IT_NOW = /დამიწერე|გააკეთე|make (?:me )?a note|write (?:me )?a note/i;

export function wantsImmediateCreate(prompt: string, confirmed?: boolean): boolean {
  if (confirmed) return true;
  const text = prompt.trim();
  return GENERATE_NOW.test(text) || DO_IT_NOW.test(text);
}

export function looksLikeQuestion(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (/[?؟]/.test(text)) return true;
  return /^(რომელია|რომელი|რა არის|რა იყო|რა ქვია|როგორ |სად არის|სადაა|როდის |რატომ |why\b|what\b|where\b|who\b|how\b|which\b)/i.test(
    text,
  );
}

function stripIntentPhrases(prompt: string): string {
  let text = prompt.replace(/\S*კონსპექტ\S*/giu, " ");
  for (const key of [...TOPIC_STRIP].sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  return text;
}

function stripCase(token: string): string {
  return token.replace(/(ში|ზე|დან|თვის|ით)$/u, "");
}

export function extractTopic(prompt: string): string | null {
  const leftover = stripIntentPhrases(prompt);
  const words = leftover
    .split(/[\s]+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .map((word) => stripCase(word))
    .filter((word) => word.length > 1 && !FILLERS.has(word.toLowerCase()) && !/^\d+$/.test(word));
  const topic = words.join(" ").replace(/\s+/g, " ").trim();
  return topic || null;
}

export function extractAppendCount(prompt: string): number {
  const match = prompt.match(/(\d+)/);
  if (!match) return 5;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(10, Math.max(1, Math.floor(n)));
}

function hasListShape(prompt: string): boolean {
  const text = prompt.trim();
  if (/[,;/]| - /.test(text)) return true;
  if (/\s(და|and|vs\.?|versus)\s/i.test(text)) return true;
  return false;
}

export function specificityOf(topic: string | null, rawPrompt: string): RouteSpecificity {
  if (!topic) return "broad";
  if (hasListShape(rawPrompt) || hasListShape(topic)) return "specific";
  const tokens = topic.split(/\s+/).filter(Boolean);
  return tokens.length >= 2 ? "specific" : "broad";
}

export function mergePracticeTopic(current?: string | null, pending?: string | null): string | undefined {
  const a = current?.trim() || "";
  const b = pending?.trim() || "";
  if (a && b && a !== b && !a.includes(b) && !b.includes(a)) return `${a} · ${b}`;
  return a || b || undefined;
}

export function assessCreateReady(input: {
  topic: string | null;
  prompt: string;
  hasMaterials?: boolean;
  confirmed?: boolean;
  priorClarify?: boolean;
}): { ready: boolean; missing: string[]; specificity: RouteSpecificity } {
  const topic = input.topic?.trim() || extractTopic(input.prompt);
  const specificity = specificityOf(topic, input.prompt);
  const ready =
    Boolean(topic) ||
    Boolean(input.hasMaterials) ||
    Boolean(input.priorClarify);
  return { ready, missing: ready ? [] : ["topic"], specificity };
}

export function intentFromTool(name: ChatToolName): ComposerIntent {
  if (name === "create_practice" || name === "suggest_practice") return "practice";
  if (name === "create_sheet" || name === "suggest_sheet") return "study";
  if (
    name === "create_path" ||
    name === "suggest_path" ||
    name === "advance_path" ||
    name === "restart_path" ||
    name === "start_path"
  ) {
    return "plan";
  }
  if (name === "edit_practice") return "edit";
  if (name === "append_practice") return "append";
  if (name === "edit_sheet") return "rewrite_sheet";
  return "ask";
}

const EXAM_HINT = /გამომცადე|გამოცდა|\bexam\b|quiz me|test me|\bquiz\b/i;
const PRACTICE_HINT = /დამავარჯიშე|ვივარჯიშო|ვარჯიში|\bpractice\b/i;
/** One stem covers კონსპექტი / დავაკონსპექტო / დამიკონსპექტე. */
const SHEET_HINT = /კონსპექტ|შემომაჯამე|შემაჯამე|study sheet|make (?:me )?a note|write (?:me )?a note|\bnotes?\b|summarize/i;
/** Course map — not a notes dump. */
const PATH_HINT =
  /სილაბუს|syllabus|study path|course path|კურსის გზა|სასწავლო გზა|დაგეგმე კურსი|დამიგეგმე|map this course|map the course|ეს კურსი მასწავლე|მასწავლე ეს კურსი|გზა დამიკეთე/i;
/** Exam review track — not "quiz me now". */
const EXAM_PREP_HINT =
  /ფინალურ|გამეორება|გამიმეორე|exam prep|final exam|revise for|review for (the )?(exam|final)|study for (the )?(exam|final)/i;
const ADVANCE_HINT =
  /გავიარე|გავიარეთ|შემდეგი თემა|შემდეგი ნაბიჯი|next topic|next step|mark (this )?done|i(?:['’]m| am) done with this/i;
const RESTART_PATH_HINT =
  /პირველიდან|თავიდან\s*(დაიწყ|დავიწყ)|დაიწყე?\s*თავიდან|start from (the )?(beginning|first|start)|from the (beginning|start)|reset (the )?(path|progress)|დაბრუნდი\s*თავ|თავში\s*დავყენო/i;
const START_PATH_HINT =
  /დავიწყოთ|დავიწყო|მზად ვარ|let'?s start|start (the )?(path|course)|i'?m ready|\bcontinue\b|გავაგრძელოთ|go ahead/i;
/** Conservative fallback: a subject containing a media stem is not an image request. */
const IMAGE_MEDIA = /(?:^|[^\p{L}\p{N}])(?:ფოტო(?:ებ\p{L}*|ს|ზე|ში)?|ფოტოსურათ\p{L}*|სურათ\p{L}*|photos?|images?|pictures?)(?=$|[^\p{L}\p{N}])/iu;
const IMAGE_DIAGRAM = /(?:^|[^\p{L}\p{N}])(?:გრაფიკ\p{L}*|დიაგრამ\p{L}*|charts?|graphs?|diagrams?)(?=$|[^\p{L}\p{N}])/iu;
const IMAGE_REQUEST = /მაჩვენ|მომიძებნ|იპოვ|\b(?:show|find|search|display)\b|look\s+for/i;
const EDIT_HINT = /გაამარტივე|შეამოკლე|simplify|shorten|rewrite|easier/i;
const APPEND_HINT = /დაამატე|add more|more questions|more items/i;

/** Hidden tutor turns. Keyword routers must not treat "notes"/"practice" in these strings as a user request. */
function isInternalTutorPrompt(prompt: string): boolean {
  const text = prompt.trim();
  return (
    text.startsWith("Tutor-lead (not a user request):") ||
    text.startsWith("Move-on (not a user request):") ||
    text.startsWith("The student just looked at ") ||
    text.startsWith("Hint-only (not a user request):") ||
    text.startsWith("Exam-only (not a user request):") ||
    text.startsWith("Work-finished (not a user request):")
  );
}

function mayAttachQuestion(prompt: string): boolean {
  const text = prompt.trim();
  if (text.startsWith("Move-on (not a user request):") || text.startsWith("Exam-only (not a user request):")) return true;
  if (isInternalTutorPrompt(text)) return false;
  return wantsPractice(prompt) || wantsExam(prompt) || wantsAdvancePath(prompt);
}

export function wantsExam(prompt: string): boolean {
  if (isInternalTutorPrompt(prompt)) return false;
  return EXAM_HINT.test(prompt);
}

export function wantsPractice(prompt: string): boolean {
  if (isInternalTutorPrompt(prompt)) return false;
  return PRACTICE_HINT.test(prompt) || EXAM_HINT.test(prompt);
}

export function practiceModeOf(prompt: string, mode?: string | null): "practice" | "exam" {
  if (mode === "exam" || mode === "practice") return mode;
  return wantsExam(prompt) ? "exam" : "practice";
}

export function wantsSheet(prompt: string): boolean {
  if (isInternalTutorPrompt(prompt)) return false;
  return SHEET_HINT.test(prompt);
}

export function wantsExamPrep(prompt: string): boolean {
  if (isInternalTutorPrompt(prompt)) return false;
  return EXAM_PREP_HINT.test(prompt);
}

export function wantsPath(prompt: string): boolean {
  if (isInternalTutorPrompt(prompt)) return false;
  return PATH_HINT.test(prompt) || EXAM_PREP_HINT.test(prompt);
}

export function pathKindOf(prompt: string): "course" | "review" {
  return wantsExamPrep(prompt) ? "review" : "course";
}

export function wantsAdvancePath(prompt: string): boolean {
  return ADVANCE_HINT.test(prompt);
}

export function wantsRestartPath(prompt: string): boolean {
  return RESTART_PATH_HINT.test(prompt);
}

export function wantsStartPath(prompt: string): boolean {
  return START_PATH_HINT.test(prompt);
}

export function wantsImages(prompt: string): boolean {
  if (isInternalTutorPrompt(prompt) || isSimpleChatTask(prompt)) return false;
  const requested = IMAGE_REQUEST.test(prompt);
  if (!requested && /რა არის|რას ნიშნავს|როგორ მუშაობს|\bwhat (?:is|are|does)\b|\bhow does\b/i.test(prompt)) return false;
  return IMAGE_MEDIA.test(prompt) || (requested && IMAGE_DIAGRAM.test(prompt));
}

export function promptIsKa(text: string): boolean {
  return /[\u10A0-\u10FF]/.test(text);
}

const IMAGE_STRIP = [
  "ფოტოები მაინტერესებს",
  "ფოტოები",
  "ფოტო",
  "სურათები",
  "სურათი",
  "სურათ",
  "გრაფიკები",
  "გრაფიკი",
  "გრაფიკ",
  "მომიძებნე",
  "look up images",
  "look up photos",
  "show me photos of",
  "show me photos",
  "show me images of",
  "show me images",
  "photos of",
  "images of",
  "pictures of",
  "pictures",
  "picture",
  "photos",
  "photo",
  "images",
  "image",
  "charts",
  "chart",
  "graphs",
  "graph",
  "diagrams",
  "diagram",
  "find me",
  "look up",
  "pics",
];

function stripImagePhrases(prompt: string): string {
  let text = prompt;
  for (const key of [...IMAGE_STRIP].sort((a, b) => b.length - a.length)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = /[A-Za-z]/.test(key) ? new RegExp(`\\b${escaped}\\b`, "gi") : new RegExp(escaped, "gi");
    text = text.replace(pattern, " ");
  }
  return text;
}

export function extractImageQuery(prompt: string): string | null {
  return extractTopic(stripImagePhrases(prompt));
}

export function imageClarifyQuestion(prompt: string): string {
  return promptIsKa(prompt) ? "რა თემის ფოტოები გინდა?" : "What should I search photos of?";
}

export function resolvePendingKind(
  prompt: string,
  pending?: { pendingKind?: PendingKind | null },
): PendingKind | null {
  if (wantsSheet(prompt)) return "sheet";
  if (wantsPractice(prompt)) return "practice";
  if (wantsPath(prompt)) return "path";
  if (wantsImages(prompt)) return "images";
  return pending?.pendingKind ?? null;
}

export function pendingCreateFromMessages(
  messages: Array<{
    role: string;
    content: string;
    artifact?: { kind?: string } | null;
    options?: string[] | null;
    pendingKind?: PendingKind | null;
  }>,
): { priorClarify: boolean; pendingTopic: string | null; pendingKind: PendingKind | null } {
  const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant");
  const priorClarify = Boolean(lastAssistant && !lastAssistant.artifact && lastAssistant.options != null);
  const storedKind =
    lastAssistant?.pendingKind === "sheet" ||
    lastAssistant?.pendingKind === "practice" ||
    lastAssistant?.pendingKind === "images" ||
    lastAssistant?.pendingKind === "path"
      ? lastAssistant.pendingKind
      : null;
  const lastHint = [...messages].reverse().find(
    (item) =>
      item.role === "user" &&
      (PRACTICE_HINT.test(item.content) ||
        EXAM_HINT.test(item.content) ||
        SHEET_HINT.test(item.content) ||
        PATH_HINT.test(item.content) ||
        EXAM_PREP_HINT.test(item.content) ||
        wantsImages(item.content)),
  );
  const pendingKind: PendingKind | null =
    storedKind ??
    (!lastHint
      ? null
      : SHEET_HINT.test(lastHint.content)
        ? "sheet"
        : PRACTICE_HINT.test(lastHint.content) || EXAM_HINT.test(lastHint.content)
          ? "practice"
          : PATH_HINT.test(lastHint.content) || EXAM_PREP_HINT.test(lastHint.content)
            ? "path"
            : wantsImages(lastHint.content)
              ? "images"
              : null);
  const pendingTopic = lastHint
    ? pendingKind === "images"
      ? extractImageQuery(lastHint.content)
      : extractTopic(lastHint.content)
    : null;
  return { priorClarify, pendingTopic, pendingKind };
}

function createToolForPending(pendingKind?: PendingKind | null, askedSheet?: boolean): "create_practice" | "create_sheet" {
  return askedSheet || pendingKind === "sheet" ? "create_sheet" : "create_practice";
}

export function sheetClarifyQuestion(prompt: string): string {
  return promptIsKa(prompt) ? "რა თემის კონსპექტი გინდა?" : "What should I take notes on?";
}

export function practiceClarifyQuestion(prompt: string): string {
  return promptIsKa(prompt) ? "რაზე გავაკეთო ვარჯიში?" : "What should we practice?";
}

export function acceptedToolFromIntent(
  intent?: ComposerIntent | null,
): AcceptedChatTool | undefined {
  if (intent === "study") return "create_sheet";
  if (intent === "practice") return "create_practice";
  if (intent === "plan") return "create_path";
  return undefined;
}

export function pathClarifyQuestion(prompt: string): string {
  return promptIsKa(prompt) ? "რომელი კურსის გზა გინდა?" : "Which course should I map?";
}

export function forcedPathTool(input: {
  prompt: string;
  hasMaterials?: boolean;
  confirmed?: boolean;
  accepted?: AcceptedChatTool;
  pathTopic?: string;
  hasPath?: boolean;
  pathStarted?: boolean;
}): ChatToolCall | null {
  if (input.accepted === "start_path" && input.hasPath && !input.pathStarted) {
    return { name: "start_path", args: {} };
  }
  if (
    input.hasPath &&
    !input.pathStarted &&
    wantsStartPath(input.prompt) &&
    !wantsSheet(input.prompt) &&
    !wantsPractice(input.prompt) &&
    !wantsImages(input.prompt) &&
    !wantsPath(input.prompt)
  ) {
    return { name: "start_path", args: {} };
  }
  if (
    input.hasPath &&
    !input.pathStarted &&
    wantsRestartPath(input.prompt) &&
    !wantsSheet(input.prompt) &&
    !wantsPractice(input.prompt) &&
    !wantsImages(input.prompt)
  ) {
    return { name: "restart_path", args: {} };
  }
  const asked = wantsPath(input.prompt) || input.accepted === "create_path";
  if (!asked) return null;
  if (input.hasPath && input.pathStarted && input.accepted !== "create_path") {
    return null;
  }
  const topic = extractTopic(input.prompt) || input.pathTopic || null;
  const ready =
    Boolean(topic) ||
    Boolean(input.hasMaterials) ||
    Boolean(input.confirmed) ||
    wantsImmediateCreate(input.prompt, input.confirmed);
  if (!ready) {
    return { name: "clarify", args: { question: pathClarifyQuestion(input.prompt) } };
  }
  const mapNow =
    input.accepted === "create_path" ||
    wantsImmediateCreate(input.prompt, input.confirmed) ||
    Boolean(input.hasMaterials);
  if (!mapNow) {
    return { name: "suggest_path", args: { topic: topic ?? undefined } };
  }
  return { name: "create_path", args: { topic: topic ?? undefined } };
}

export function forcedAdvancePath(input: { prompt: string; hasPath?: boolean; pathStarted?: boolean }): ChatToolCall | null {
  if (!input.hasPath || !input.pathStarted) return null;
  if (!wantsAdvancePath(input.prompt)) return null;
  if (wantsPath(input.prompt) || wantsPractice(input.prompt) || wantsSheet(input.prompt) || wantsImages(input.prompt)) {
    return null;
  }
  return { name: "advance_path", args: {} };
}

/** Create notes/practice without waiting for the model. The chat LLM must not write the artifact as text. */
export function forcedCreateTool(input: {
  prompt: string;
  hasMaterials?: boolean;
  confirmed?: boolean;
  priorClarify?: boolean;
  pendingTopic?: string | null;
  pendingKind?: PendingKind | null;
  accepted?: AcceptedChatTool;
  pathTopic?: string;
  projectTitle?: string;
}): ChatToolCall | null {
  const prompt = input.prompt;
  if (input.accepted === "create_path" || wantsPath(prompt)) return null;
  if (
    isFormWriteTopic(prompt, input.pendingTopic, input.pathTopic, input.projectTitle) &&
    input.accepted !== "create_sheet"
  ) {
    return null;
  }
  const askedPractice = wantsPractice(prompt);
  const askedSheet = wantsSheet(prompt);
  if (wantsImages(prompt) && !askedPractice && !askedSheet) return null;

  const wantsSheetCreate =
    input.accepted === "create_sheet" ||
    (askedSheet && wantsImmediateCreate(prompt, input.confirmed)) ||
    (input.pendingKind === "sheet" && ACCEPT_OFFER.test(prompt.trim()));
  const wantsPracticeCreate =
    input.accepted === "create_practice" ||
    (askedPractice && wantsImmediateCreate(prompt, input.confirmed)) ||
    (input.pendingKind === "practice" && ACCEPT_OFFER.test(prompt.trim()));
  if (!wantsSheetCreate && !wantsPracticeCreate) return null;

  const name: "create_sheet" | "create_practice" = wantsSheetCreate ? "create_sheet" : "create_practice";
  const topic = mergePracticeTopic(extractTopic(prompt), input.pendingTopic) ?? input.pathTopic ?? undefined;
  const { ready } = assessCreateReady({
    topic: topic ?? null,
    prompt,
    hasMaterials: input.hasMaterials,
    confirmed: input.confirmed,
    priorClarify: input.priorClarify,
  });
  if (!ready) {
    return {
      name: "clarify",
      args: { question: name === "create_sheet" ? sheetClarifyQuestion(prompt) : practiceClarifyQuestion(prompt) },
    };
  }
  if (name === "create_practice") {
    return { name, args: { topic: topic ?? undefined, mode: practiceModeOf(prompt) } };
  }
  return { name, args: { topic: topic ?? undefined } };
}

/** Tiny keyword fallback if the provider returned no tool. Not the main router. */
export function fallbackChatTool(input: {
  prompt: string;
  active?: { kind: string; id: string } | null;
  accepted?: AcceptedChatTool;
  priorClarify?: boolean;
  pendingTopic?: string | null;
  pendingKind?: PendingKind | null;
  pathTopic?: string;
  projectTitle?: string;
  hasPath?: boolean;
  pathStarted?: boolean;
}): ChatToolCall {
  if (input.accepted === "search_images") {
    return { name: "search_images", args: { query: input.prompt.trim() } };
  }
  if (input.accepted === "start_path") {
    return { name: "start_path", args: {} };
  }
  if (input.accepted === "create_path") {
    return { name: "create_path", args: { topic: extractTopic(input.prompt) ?? input.pathTopic ?? undefined } };
  }
  if (input.accepted) {
    return { name: input.accepted, args: { topic: extractTopic(input.prompt) ?? input.pendingTopic ?? undefined } };
  }
  const prompt = input.prompt;
  const active = input.active ?? null;
  if (active) {
    if (APPEND_HINT.test(prompt) && active.kind === "practice_set") {
      return {
        name: "append_practice",
        args: { id: active.id, count: extractAppendCount(prompt), instruction: prompt },
      };
    }
    if (APPEND_HINT.test(prompt) && active.kind === "study_sheet") {
      return {
        name: "edit_sheet",
        args: { id: active.id, count: extractAppendCount(prompt), instruction: prompt },
      };
    }
    if (EDIT_HINT.test(prompt) && active.kind === "practice_set") {
      return {
        name: "edit_practice",
        args: { id: active.id, instruction: prompt },
      };
    }
    if (EDIT_HINT.test(prompt) && active.kind === "study_sheet") {
      return {
        name: "edit_sheet",
        args: { id: active.id, instruction: prompt },
      };
    }
  }
  if (looksLikeQuestion(prompt) && !wantsPractice(prompt) && !wantsSheet(prompt) && !wantsImages(prompt) && !PATH_HINT.test(prompt) && !ADVANCE_HINT.test(prompt) && !RESTART_PATH_HINT.test(prompt) && !START_PATH_HINT.test(prompt)) {
    return { name: "answer", args: {} };
  }
  const askedPractice = wantsPractice(prompt);
  const askedSheet = wantsSheet(prompt);
  if (input.priorClarify && input.pendingKind === "images") {
    return {
      name: "search_images",
      args: { query: prompt.trim() },
    };
  }
  if (wantsImages(prompt) && !askedPractice && !askedSheet) {
    const query = extractImageQuery(prompt);
    if (!query && !input.priorClarify) {
      return { name: "clarify", args: { question: imageClarifyQuestion(prompt) } };
    }
    return { name: "search_images", args: { query: prompt.trim() } };
  }
  const pathTool = forcedPathTool({
    prompt,
    confirmed: false,
    accepted: input.accepted,
    pathTopic: input.pathTopic,
    hasPath: input.hasPath,
    pathStarted: input.pathStarted,
  });
  if (pathTool) return pathTool;
  const advanced = forcedAdvancePath({ prompt, hasPath: input.hasPath, pathStarted: input.pathStarted });
  if (advanced) return advanced;
  const forced = forcedCreateTool({
    prompt,
    priorClarify: input.priorClarify,
    pendingTopic: input.pendingTopic,
    pendingKind: input.pendingKind,
    accepted: input.accepted,
    pathTopic: input.pathTopic,
    projectTitle: input.projectTitle,
  });
  if (forced) return forced;
  return { name: "answer", args: {} };
}

function isCreateTool(name: string): name is "create_practice" | "create_sheet" {
  return name === "create_practice" || name === "create_sheet";
}

/** Safety gate: one clarify max for practice/sheet. Unknown tools pass through. */
export function gateChatTool(input: {
  tool: ChatToolCall | null;
  prompt: string;
  hasMaterials?: boolean;
  confirmed?: boolean;
  priorClarify?: boolean;
  pendingTopic?: string | null;
  pendingKind?: PendingKind | null;
  active?: { kind: string; id: string } | null;
  accepted?: AcceptedChatTool;
  pathTopic?: string;
  projectTitle?: string;
  hasPath?: boolean;
  pathStarted?: boolean;
  /** Keywords may create only when the provider returned plain text (no tool). */
  keywordFallback?: boolean;
  mode?: "auto" | "fast" | "teacher";
}): ChatToolCall {
  const prompt = input.prompt;
  const active = input.active ?? null;
  const pendingKind = input.pendingKind ?? null;
  let tool = input.tool ?? { name: "answer" as const, args: {} };

  const formWrite = isFormWriteTopic(
    prompt,
    tool.args.topic,
    input.pendingTopic,
    input.pathTopic,
    input.projectTitle,
  );
  if (
    formWrite &&
    (tool.name === "suggest_practice" ||
      tool.name === "create_practice" ||
      tool.name === "edit_practice" ||
      tool.name === "append_practice")
  ) {
    tool = { name: "answer", args: {} };
  }

  if (
    (input.mode === "fast" || isSimpleChatTask(prompt)) &&
    (tool.name === "suggest_practice" || tool.name === "suggest_sheet" || tool.name === "suggest_path")
  ) {
    tool = { name: "answer", args: {} };
  }
  if ((input.mode === "fast" || isSimpleChatTask(prompt)) && tool.name === "answer" && tool.args.options?.length) {
    tool = { name: "answer", args: { ...tool.args, options: [] } };
  }
  if (tool.name === "answer" && tool.args.question && !mayAttachQuestion(prompt)) {
    tool = { name: "answer", args: { ...tool.args, question: undefined } };
  }

  if (input.accepted === "search_images") {
    return {
      name: "search_images",
      args: {
        query: tool.args.query?.trim() || prompt.trim(),
        count: tool.args.count,
      },
    };
  }

  if ((tool.name === "edit_practice" || tool.name === "append_practice") && active?.kind !== "practice_set") {
    tool = { name: "create_practice", args: { topic: tool.args.topic ?? extractTopic(prompt) ?? undefined } };
  }
  if (tool.name === "edit_sheet" && active?.kind !== "study_sheet") {
    tool = { name: "create_sheet", args: { topic: tool.args.topic ?? extractTopic(prompt) ?? undefined } };
  }

  const askedPractice = wantsPractice(prompt);
  const askedSheet = wantsSheet(prompt);
  const askedPath = wantsPath(prompt) || input.accepted === "create_path" || pendingKind === "path";
  const askedAdvance = wantsAdvancePath(prompt);
  const askedForSheet = askedSheet || input.accepted === "create_sheet" || input.pendingKind === "sheet";
  const askedForPractice =
    askedPractice || input.accepted === "create_practice" || input.pendingKind === "practice";
  const askedImages = wantsImages(prompt) && !askedPractice && !askedSheet && !askedPath;
  if (
    askedSheet &&
    (tool.name === "suggest_path" || tool.name === "create_path" || tool.name === "start_path" || tool.name === "restart_path")
  ) {
    const topic = tool.args.topic ?? extractTopic(prompt) ?? undefined;
    tool = wantsImmediateCreate(prompt, input.confirmed)
      ? { name: "create_sheet", args: { topic } }
      : { name: "suggest_sheet", args: { topic } };
  }
  const pathToolRequested =
    askedPath ||
    tool.name === "suggest_path" ||
    tool.name === "create_path" ||
    tool.name === "start_path" ||
    tool.name === "restart_path" ||
    tool.name === "advance_path";
  if (pathToolRequested && !askedSheet && input.mode !== "teacher") {
    return { name: "answer", args: {} };
  }
  if (tool.name === "suggest_practice" && !askedForPractice && (input.mode === "fast" || isSimpleChatTask(prompt))) {
    tool = { name: "answer", args: {} };
  }
  if (tool.name === "suggest_sheet" && !askedForSheet && input.mode !== "teacher") {
    tool = { name: "answer", args: {} };
  }
  const factQuestion =
    looksLikeQuestion(prompt) &&
    !askedPractice &&
    !askedSheet &&
    !askedImages &&
    !askedPath &&
    !askedAdvance &&
    !input.confirmed &&
    !input.priorClarify;

  if (input.priorClarify && pendingKind === "images") {
    return {
      name: "search_images",
      args: {
        query: tool.args.query?.trim() || prompt.trim(),
        count: tool.args.count,
      },
    };
  }

  if (askedImages) {
    const query = tool.args.query?.trim() || extractImageQuery(prompt);
    if (!query && !input.priorClarify) {
      return {
        name: "clarify",
        args: { question: tool.args.question || imageClarifyQuestion(prompt), options: tool.args.options },
      };
    }
    return {
      name: "search_images",
      args: { query: tool.args.query?.trim() || prompt.trim(), count: tool.args.count },
    };
  }

  if (tool.name === "search_images") {
    return { name: "answer", args: {} };
  }

  const pathTool = forcedPathTool({
    prompt,
    hasMaterials: input.hasMaterials,
    confirmed: input.confirmed,
    accepted: input.accepted,
    pathTopic: input.pathTopic,
    hasPath: input.hasPath,
    pathStarted: input.pathStarted,
  });
  if (pathTool) {
    if (
      input.mode === "fast" &&
      (pathTool.name === "suggest_path" || pathTool.name === "suggest_practice" || pathTool.name === "suggest_sheet")
    ) {
      return { name: "answer", args: {} };
    }
    return pathTool;
  }
  const advanced = forcedAdvancePath({ prompt, hasPath: input.hasPath, pathStarted: input.pathStarted });
  if (advanced) return advanced;

  const forced = forcedCreateTool({
    prompt,
    hasMaterials: input.hasMaterials,
    confirmed: input.confirmed,
    priorClarify: input.priorClarify,
    pendingTopic: input.pendingTopic,
    pendingKind,
    accepted: input.accepted,
    pathTopic: input.pathTopic,
    projectTitle: input.projectTitle,
  });
  if (forced) return forced;

  if (factQuestion && (isCreateTool(tool.name) || tool.name === "clarify")) {
    return { name: "answer", args: {} };
  }

  if (
    tool.name === "clarify" &&
    !askedPractice &&
    !askedSheet &&
    !askedImages &&
    !askedPath &&
    !input.priorClarify &&
    !input.confirmed
  ) {
    return { name: "answer", args: {} };
  }

  const generateNow = wantsImmediateCreate(prompt, input.confirmed);
  const createFlow =
    pendingKind !== "images" &&
    (askedForPractice || askedForSheet || Boolean(input.priorClarify));
  const mutating = EDIT_HINT.test(prompt) || APPEND_HINT.test(prompt);

  if (
    input.keywordFallback &&
    generateNow &&
    createFlow &&
    !factQuestion &&
    !mutating &&
    !formWrite
  ) {
    if (
      tool.name === "clarify" ||
      tool.name === "answer" ||
      tool.name === "suggest_practice" ||
      tool.name === "suggest_sheet"
    ) {
      const name = createToolForPending(pendingKind, askedSheet);
      const topic = mergePracticeTopic(tool.args.topic ?? extractTopic(prompt), input.pendingTopic);
      const { ready } = assessCreateReady({
        topic: topic ?? null,
        prompt,
        hasMaterials: input.hasMaterials,
        confirmed: input.confirmed,
        priorClarify: input.priorClarify,
      });
      if (ready) {
        tool =
          name === "create_practice"
            ? { name, args: { topic, mode: practiceModeOf(prompt) } }
            : { name, args: { topic } };
      }
    }
  }

  if (tool.name === "clarify") {
    return {
      name: "clarify",
      args: {
        question: tool.args.question,
        options: tool.args.options,
      },
    };
  }

  if (tool.name === "create_sheet" && !askedForSheet) {
    return { name: "answer", args: {} };
  }
  if (tool.name === "suggest_path" && !askedPath && input.accepted !== "create_path") {
    return { name: "answer", args: {} };
  }
  if (input.hasPath && tool.name === "create_practice" && !askedForPractice) {
    return { name: "answer", args: {} };
  }
  if (input.hasPath && tool.name === "suggest_practice" && !askedForPractice) {
    return { name: "answer", args: {} };
  }

  if (isCreateTool(tool.name)) {
    if (formWrite && tool.name === "create_practice") {
      return { name: "answer", args: {} };
    }
    const topic =
      mergePracticeTopic(tool.args.topic?.trim() || extractTopic(prompt), input.pendingTopic) ??
      input.pathTopic ??
      undefined;
    const allowed =
      input.accepted === tool.name ||
      wantsImmediateCreate(prompt, input.confirmed) ||
      (input.pendingKind === (tool.name === "create_sheet" ? "sheet" : "practice") &&
        ACCEPT_OFFER.test(prompt.trim()));
    if (!allowed) {
      if (tool.name === "create_sheet" && askedForSheet) {
        return { name: "suggest_sheet", args: { topic } };
      }
      if (tool.name === "create_practice" && askedForPractice) {
        return { name: "suggest_practice", args: { topic, mode: practiceModeOf(prompt, tool.args.mode) } };
      }
      return { name: "answer", args: {} };
    }
    const { ready } = assessCreateReady({
      topic: topic ?? null,
      prompt,
      hasMaterials: input.hasMaterials,
      confirmed: input.confirmed,
      priorClarify: input.priorClarify,
    });
    if (!ready) {
      return { name: "clarify", args: { question: tool.args.question, options: tool.args.options } };
    }
    return {
      name: tool.name,
      args: {
        ...tool.args,
        topic: topic ?? undefined,
        ...(tool.name === "create_practice" ? { mode: practiceModeOf(prompt, tool.args.mode) } : {}),
      },
    };
  }

  if (tool.name === "create_path") {
    if (!askedPath && input.accepted !== "create_path") {
      return { name: "answer", args: {} };
    }
    if (input.pathStarted && input.accepted !== "create_path") {
      return { name: "answer", args: {} };
    }
    const topic = tool.args.topic ?? extractTopic(prompt) ?? input.pathTopic ?? undefined;
    const mapNow =
      input.accepted === "create_path" ||
      wantsImmediateCreate(prompt, input.confirmed) ||
      Boolean(input.hasMaterials);
    if (!mapNow) {
      return { name: "suggest_path", args: { topic } };
    }
    return {
      name: "create_path",
      args: { topic },
    };
  }
  if (tool.name === "advance_path") {
    return input.hasPath && input.pathStarted && wantsAdvancePath(prompt)
      ? { name: "advance_path", args: {} }
      : { name: "answer", args: {} };
  }
  if (tool.name === "restart_path") {
    return input.hasPath && !input.pathStarted ? { name: "restart_path", args: {} } : { name: "answer", args: {} };
  }
  if (tool.name === "start_path") {
    return input.hasPath && !input.pathStarted ? { name: "start_path", args: {} } : { name: "answer", args: {} };
  }

  if ((tool.name === "edit_practice" || tool.name === "append_practice" || tool.name === "edit_sheet") && active) {
    return {
      name: tool.name,
      args: {
        ...tool.args,
        id: active.id,
        instruction: tool.args.instruction ?? prompt,
        count: tool.name === "append_practice" ? tool.args.count ?? extractAppendCount(prompt) : tool.args.count,
      },
    };
  }

  return tool;
}

export function countPlanItems(markdown: string): number {
  const matches = markdown.match(/^\s*(?:\d+[\.)]|[-*•])\s+\S/gm);
  return matches?.length ?? 0;
}
