import {
  isArtifactTool,
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
  "ვარჯიში",
  "quiz me",
  "test me",
  "practice",
  "quiz",
  "კონსპექტი",
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

function stripIntentPhrases(prompt: string): string {
  let text = prompt;
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

export function assessCreateReady(input: {
  topic: string | null;
  prompt: string;
  hasMaterials?: boolean;
  confirmed?: boolean;
}): { ready: boolean; missing: string[]; specificity: RouteSpecificity } {
  const topic = input.topic?.trim() || extractTopic(input.prompt);
  const specificity = specificityOf(topic, input.prompt);
  const missing: string[] = [];
  if (!topic) missing.push("topic");
  else if (specificity === "broad") missing.push("narrower topic");
  const ready =
    missing.length === 0 ||
    Boolean(input.hasMaterials) ||
    (Boolean(input.confirmed) && Boolean(topic || input.hasMaterials));
  return { ready, missing: ready ? [] : missing, specificity };
}

export function intentFromTool(name: ChatToolName): ComposerIntent {
  if (name === "create_practice" || name === "suggest_practice") return "practice";
  if (name === "create_sheet" || name === "suggest_sheet") return "study";
  if (name === "edit_practice") return "edit";
  if (name === "append_practice") return "append";
  if (name === "edit_sheet") return "rewrite_sheet";
  return "ask";
}

const PRACTICE_HINT = /დამავარჯიშე|გამომცადე|ვარჯიში|quiz me|test me|\bpractice\b|\bquiz\b/i;
const SHEET_HINT = /კონსპექტი|შემომაჯამე|შემაჯამე|study sheet|summarize/i;
const EDIT_HINT = /გაამარტივე|შეამოკლე|simplify|shorten|rewrite|easier/i;
const APPEND_HINT = /დაამატე|add more|more questions|more items/i;

/** Tiny keyword fallback if the provider returned no tool. Not the main router. */
export function fallbackChatTool(input: {
  prompt: string;
  active?: { kind: "practice_set" | "study_sheet"; id: string } | null;
  accepted?: "create_practice" | "create_sheet";
}): ChatToolCall {
  if (input.accepted) {
    return { name: input.accepted, args: { topic: extractTopic(input.prompt) ?? undefined } };
  }
  const prompt = input.prompt;
  const active = input.active ?? null;
  if (active) {
    if (APPEND_HINT.test(prompt)) {
      return {
        name: active.kind === "practice_set" ? "append_practice" : "edit_sheet",
        args: { id: active.id, count: extractAppendCount(prompt), instruction: prompt },
      };
    }
    if (EDIT_HINT.test(prompt)) {
      return {
        name: active.kind === "practice_set" ? "edit_practice" : "edit_sheet",
        args: { id: active.id, instruction: prompt },
      };
    }
  }
  if (PRACTICE_HINT.test(prompt)) {
    return { name: "create_practice", args: { topic: extractTopic(prompt) ?? undefined } };
  }
  if (SHEET_HINT.test(prompt)) {
    return { name: "create_sheet", args: { topic: extractTopic(prompt) ?? undefined } };
  }
  return { name: "answer", args: {} };
}

function clarifyQuestion(missing: string[]): string {
  if (missing.includes("topic")) return "What topic should I cover?";
  return "Can you narrow that down?";
}

/** Safety gate: vague create becomes clarify. Edit/append bind to the active artifact id. */
export function gateChatTool(input: {
  tool: ChatToolCall | null;
  prompt: string;
  hasMaterials?: boolean;
  confirmed?: boolean;
  active?: { kind: "practice_set" | "study_sheet"; id: string } | null;
}): ChatToolCall {
  const prompt = input.prompt;
  const active = input.active ?? null;
  let tool = input.tool ?? { name: "answer" as const, args: {} };

  if ((tool.name === "edit_practice" || tool.name === "append_practice") && active?.kind !== "practice_set") {
    tool = { name: "create_practice", args: { topic: tool.args.topic ?? extractTopic(prompt) ?? undefined } };
  }
  if (tool.name === "edit_sheet" && active?.kind !== "study_sheet") {
    tool = { name: "create_sheet", args: { topic: tool.args.topic ?? extractTopic(prompt) ?? undefined } };
  }

  if (tool.name === "create_practice" || tool.name === "create_sheet") {
    const topic = tool.args.topic?.trim() || extractTopic(prompt);
    const { ready, missing } = assessCreateReady({
      topic,
      prompt,
      hasMaterials: input.hasMaterials,
      confirmed: input.confirmed,
    });
    if (!ready) {
      return { name: "clarify", args: { question: clarifyQuestion(missing) } };
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

  if (!isArtifactTool(tool.name) && tool.name !== "clarify" && tool.name !== "suggest_practice" && tool.name !== "suggest_sheet") {
    return { name: "answer", args: {} };
  }
  return tool;
}

export function countPlanItems(markdown: string): number {
  const matches = markdown.match(/^\s*(?:\d+[\.)]|[-*•])\s+\S/gm);
  return matches?.length ?? 0;
}
