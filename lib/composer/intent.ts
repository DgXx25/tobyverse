import {
  type ChatToolCall,
  type ChatToolName,
} from "@/lib/ai/tools";

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
  practice: "Practice",
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
  "მინდა",
  "გთხოვ",
  "რომ",
]);

const TOPIC_STRIP = [
  "დამავარჯიშე",
  "გამომცადე",
  "ვივარჯიშო",
  "ვარჯიში",
  "quiz me",
  "test me",
  "practice",
  "quiz",
  "შემომაჯამე",
  "study sheet",
  "summarize",
  "გაამარტივე",
  "შეამოკლე",
  "simplify",
  "shorten",
  "დაამატე",
  "add more",
];

const GENERATE_NOW =
  /რაც გინდა|რაც მოგივა|დააგენერირე|გენერირება|\bსულ\b|just generate|generate (it|now|anyway)|whatever|random\b|any(thing)? (is )?fine|don't care|dont care|up to you|i don't mind/i;

export function wantsImmediateCreate(prompt: string, confirmed?: boolean): boolean {
  if (confirmed) return true;
  return GENERATE_NOW.test(prompt.trim());
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
    Boolean(input.priorClarify) ||
    wantsImmediateCreate(input.prompt, input.confirmed);
  return { ready, missing: ready ? [] : ["topic"], specificity };
}

export function intentFromTool(name: ChatToolName): ComposerIntent {
  if (name === "create_practice" || name === "suggest_practice") return "practice";
  if (name === "create_sheet" || name === "suggest_sheet") return "study";
  if (name === "edit_practice") return "edit";
  if (name === "append_practice") return "append";
  if (name === "edit_sheet") return "rewrite_sheet";
  return "ask";
}

const PRACTICE_HINT =
  /დამავარჯიშე|გამომცადე|ვივარჯიშო|ვარჯიში|quiz me|test me|\bpractice\b|\bquiz\b/i;
/** One stem covers კონსპექტი / დავაკონსპექტო / დამიკონსპექტე. */
const SHEET_HINT = /კონსპექტ|შემომაჯამე|შემაჯამე|study sheet|\bnotes\b|summarize/i;
/** One stem covers ფოტოები / photo / image. Not a keyword brain. */
const IMAGE_HINT = /ფოტო|\bphotos?\b|\bimages?\b/i;
const EDIT_HINT = /გაამარტივე|შეამოკლე|simplify|shorten|rewrite|easier/i;
const APPEND_HINT = /დაამატე|add more|more questions|more items/i;

export function wantsPractice(prompt: string): boolean {
  return PRACTICE_HINT.test(prompt);
}

export function wantsSheet(prompt: string): boolean {
  return SHEET_HINT.test(prompt);
}

export function wantsImages(prompt: string): boolean {
  return IMAGE_HINT.test(prompt);
}

export function resolvePendingKind(
  prompt: string,
  pending?: { pendingKind?: "practice" | "sheet" | null },
): "practice" | "sheet" | null {
  if (wantsSheet(prompt)) return "sheet";
  if (wantsPractice(prompt)) return "practice";
  return pending?.pendingKind ?? null;
}

export function pendingCreateFromMessages(
  messages: Array<{
    role: string;
    content: string;
    artifact?: { kind?: string } | null;
    options?: string[] | null;
    pendingKind?: "practice" | "sheet" | null;
  }>,
): { priorClarify: boolean; pendingTopic: string | null; pendingKind: "practice" | "sheet" | null } {
  const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant");
  const priorClarify = Boolean(lastAssistant && !lastAssistant.artifact && lastAssistant.options != null);
  const storedKind =
    lastAssistant?.pendingKind === "sheet" || lastAssistant?.pendingKind === "practice"
      ? lastAssistant.pendingKind
      : null;
  const lastHint = [...messages].reverse().find(
    (item) => item.role === "user" && (PRACTICE_HINT.test(item.content) || SHEET_HINT.test(item.content)),
  );
  const pendingKind: "practice" | "sheet" | null =
    storedKind ?? (!lastHint ? null : SHEET_HINT.test(lastHint.content) ? "sheet" : "practice");
  const pendingTopic = lastHint ? extractTopic(lastHint.content) : null;
  return { priorClarify, pendingTopic, pendingKind };
}

function createToolForPending(pendingKind?: "practice" | "sheet" | null, askedSheet?: boolean): "create_practice" | "create_sheet" {
  return askedSheet || pendingKind === "sheet" ? "create_sheet" : "create_practice";
}

/** Tiny keyword fallback if the provider returned no tool. Not the main router. */
export function fallbackChatTool(input: {
  prompt: string;
  active?: { kind: string; id: string } | null;
  accepted?: "create_practice" | "create_sheet";
  priorClarify?: boolean;
  pendingTopic?: string | null;
  pendingKind?: "practice" | "sheet" | null;
}): ChatToolCall {
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
  if (looksLikeQuestion(prompt) && !PRACTICE_HINT.test(prompt) && !SHEET_HINT.test(prompt) && !IMAGE_HINT.test(prompt)) {
    return { name: "answer", args: {} };
  }
  const askedPractice = PRACTICE_HINT.test(prompt);
  const askedSheet = SHEET_HINT.test(prompt);
  if (wantsImages(prompt) && !askedPractice && !askedSheet) {
    return { name: "search_images", args: { query: extractTopic(prompt) || prompt.trim() } };
  }
  const createFlow = Boolean(input.priorClarify || input.pendingKind || askedPractice || askedSheet);
  if (input.priorClarify && !looksLikeQuestion(prompt)) {
    return {
      name: createToolForPending(input.pendingKind, askedSheet),
      args: { topic: mergePracticeTopic(extractTopic(prompt), input.pendingTopic) },
    };
  }
  if (wantsImmediateCreate(prompt) && createFlow) {
    return {
      name: createToolForPending(input.pendingKind, askedSheet),
      args: { topic: mergePracticeTopic(extractTopic(prompt), input.pendingTopic) },
    };
  }
  if (askedPractice) {
    return { name: "create_practice", args: { topic: extractTopic(prompt) ?? undefined } };
  }
  if (askedSheet) {
    return { name: "create_sheet", args: { topic: extractTopic(prompt) ?? undefined } };
  }
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
  pendingKind?: "practice" | "sheet" | null;
  active?: { kind: string; id: string } | null;
}): ChatToolCall {
  const prompt = input.prompt;
  const active = input.active ?? null;
  const pendingKind = input.pendingKind ?? null;
  let tool = input.tool ?? { name: "answer" as const, args: {} };

  if ((tool.name === "edit_practice" || tool.name === "append_practice") && active?.kind !== "practice_set") {
    tool = { name: "create_practice", args: { topic: tool.args.topic ?? extractTopic(prompt) ?? undefined } };
  }
  if (tool.name === "edit_sheet" && active?.kind !== "study_sheet") {
    tool = { name: "create_sheet", args: { topic: tool.args.topic ?? extractTopic(prompt) ?? undefined } };
  }

  const askedPractice = PRACTICE_HINT.test(prompt);
  const askedSheet = SHEET_HINT.test(prompt);
  const askedImages = wantsImages(prompt) && !askedPractice && !askedSheet;
  const factQuestion = looksLikeQuestion(prompt) && !askedPractice && !askedSheet && !input.confirmed;

  if (askedImages) {
    return {
      name: "search_images",
      args: { query: tool.args.query?.trim() || extractTopic(prompt) || prompt.trim() },
    };
  }

  if (factQuestion && (isCreateTool(tool.name) || tool.name === "clarify" || tool.name === "search_images")) {
    return { name: "answer", args: {} };
  }

  if (tool.name === "search_images" && !(input.priorClarify && pendingKind)) {
    return {
      name: "search_images",
      args: { query: tool.args.query?.trim() || extractTopic(prompt) || prompt.trim() },
    };
  }

  const generateNow = wantsImmediateCreate(prompt, input.confirmed);
  const createFlow =
    askedPractice || askedSheet || pendingKind === "practice" || pendingKind === "sheet" || Boolean(input.priorClarify);
  const mutating = EDIT_HINT.test(prompt) || APPEND_HINT.test(prompt);

  if ((generateNow || input.priorClarify) && createFlow && !factQuestion && !mutating) {
    if (
      tool.name === "clarify" ||
      tool.name === "answer" ||
      tool.name === "suggest_practice" ||
      tool.name === "suggest_sheet" ||
      tool.name === "search_images"
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
        tool = { name, args: { topic } };
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

  if (isCreateTool(tool.name)) {
    const topic = mergePracticeTopic(tool.args.topic?.trim() || extractTopic(prompt), input.pendingTopic);
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
    return { name: tool.name, args: { ...tool.args, topic: topic ?? undefined } };
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
