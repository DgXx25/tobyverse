export const CHAT_TOOLS = [
  "answer",
  "clarify",
  "suggest_practice",
  "suggest_sheet",
  "suggest_path",
  "create_practice",
  "edit_practice",
  "append_practice",
  "create_sheet",
  "edit_sheet",
  "create_path",
  "advance_path",
  "restart_path",
  "start_path",
  "search_images",
] as const;

export type ChatToolName = (typeof CHAT_TOOLS)[number];

/** Never sent as Gemini functions. Keyword / chip intercept owns these. */
export const INTERCEPT_ONLY_CHAT_TOOLS = [
  "create_practice",
  "create_sheet",
  "create_path",
  "edit_practice",
  "append_practice",
  "edit_sheet",
] as const satisfies readonly ChatToolName[];

export type ChatToolArgs = {
  topic?: string;
  question?: string;
  options?: string[];
  instruction?: string;
  count?: number;
  id?: string;
  query?: string;
  mode?: "practice" | "exam";
};

export type ChatToolCall = {
  name: ChatToolName;
  args: ChatToolArgs;
};

export type ChatStreamPart = {
  text?: string;
  tool?: ChatToolCall;
};

export type ChatToolJsonProperty =
  | { type: "string"; description: string }
  | { type: "integer"; description: string }
  | { type: "array"; description: string; items: { type: "string" } };

export type ChatToolJsonSchema = {
  type: "object";
  properties: Record<string, ChatToolJsonProperty>;
  required?: string[];
};

export type ChatToolDefinition = {
  name: ChatToolName;
  description: string;
  parameters: ChatToolJsonSchema;
  /** If true, the client shows a card and the route does not stream body text. */
  card?: boolean;
};

export const CHAT_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  {
    name: "answer",
    description:
      "Default. A topic name or ordinary question: write the explanation in the user's language. Never reply by asking what the topic is. No chips. Do not create a set unless they asked to practice or to move on. Do not pass `question` unless they asked to move on or this is an exam-only turn. Never yes/no \"did you get it?\". Never \"what is this called?\" / \"which tense would you use to describe…\". Skip `question` for translate/rewrite/calculate/\"write X\". Table cells: a few words, not a paragraph, never a long parenthetical. Example then `<br>` then a short gloss in their language.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Only when they asked to move on or for a check: a sentence to complete, same shape as the example. Separate message. Not yes/no. Not \"what is this called?\" / \"which tense describes…\".",
        },
        options: {
          type: "array",
          description: "Optional 2-4 short tap answers that are candidate FORMS (will finish / will have finished), not topic names. Same language. Do not include Other/სხვა.",
          items: { type: "string" },
        },
      },
    },
  },
  {
    name: "clarify",
    description:
      "Only when the user asked to practice, for notes, or for photos and one detail is missing. Ask ONE concrete question in their language. Include 2-4 short tap options when you have them. Never a second clarify. Never canned English. Do not use for ordinary questions.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The one concrete question, in the user's language." },
        options: {
          type: "array",
          description: "2-4 short options the user can tap. Same language as the question. Do not include Other/სხვა.",
          items: { type: "string" },
        },
      },
      required: ["question"],
    },
  },
  {
    name: "suggest_practice",
    description:
      "After a short briefing, when they asked to practice or for an exam, or they asked to move on. Offer a chip. Do not create the set. Do not offer this after an ordinary explanation. Do not offer this for form-writing (განცხადება / official letter) — that is a paper block in chat. Pass mode exam if they asked for an exam (გამოცდა / გამომცადე / test me).",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic for the chip." },
        mode: { type: "string", description: "practice or exam." },
      },
    },
  },
  {
    name: "suggest_sheet",
    description:
      "When they asked for notes / კონსპექტი. Offer a chip. Do not create the sheet. In Teacher mode you MAY also suggest_sheet after a long explanation — not a one-line answer, not every turn, not on Fast. Do not pass `question`.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Topic for the chip." } },
    },
  },
  {
    name: "suggest_path",
    description:
      "After a short briefing or one clarify, when they asked to plan (დამიგეგმე / სწავლა მინდა as a plan) or for exam review but a syllabus/topic is still thin. Offer a chip. Do not create the path. Never dump the week list.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Course or exam-review topic for the chip." } },
    },
  },
  {
    name: "create_practice",
    description:
      "Only after they accepted a practice/exam chip, said yes, or said დამიწერე / გააკეთე. First ask: brief the move, then suggest_practice — do not create yet. Never write quiz items into chat — card only. Never for form-writing (განცხადება) — that is a paper block. Pass mode exam if they asked for an exam. On a review path, only for memory-heavy theory (terms, lists, flags, formulas) — not a 10-item MCQ because practice exists.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Practice or exam topic, including the latest user topic." },
        mode: { type: "string", description: "practice (retry mistakes until they finish) or exam (one check, 50% counts as a pass)." },
      },
      required: ["topic"],
    },
    card: true,
  },
  {
    name: "edit_practice",
    description: "Change the current practice set. Keep the same id. Never dump items into chat.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active practice set id." },
        instruction: { type: "string", description: "How to change the items." },
      },
      required: ["instruction"],
    },
    card: true,
  },
  {
    name: "append_practice",
    description: "Add items to the current practice set. Same id. Never dump items into chat.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active practice set id." },
        count: { type: "integer", description: "How many items to add (1–10)." },
        instruction: { type: "string", description: "What to add." },
      },
    },
    card: true,
  },
  {
    name: "create_sheet",
    description:
      "Only after they accepted a notes chip, said yes, or said დამიწერე / გააკეთე. Never write the notes as chat text. Notes teach understanding (meaning first, then formula). One short chat line plus the card. Do not generate long notes on a review path unless they asked.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Specific sheet topic." } },
      required: ["topic"],
    },
    card: true,
  },
  {
    name: "edit_sheet",
    description:
      "Rewrite the current notes so a beginner gets the idea (meaning first, then formula). Keep the same id. Never dump the notes into chat.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Active sheet id." },
        instruction: { type: "string", description: "How to rewrite the sheet." },
      },
      required: ["instruction"],
    },
    card: true,
  },
  {
    name: "create_path",
    description:
      "They asked to plan with a syllabus/topic (დამიგეგმე) or for exam prep with dumped slides/quizzes, or they accepted a plan chip / said დამიწერე / გააკეთე. Build the path card only — never write the week list in chat. Skip course-intro / aims / grading as lesson 1. First node is the first real topic. Exam prep = a short review path (about 4–8 high-yield nodes), not a week-long course. Do not create notes or practice. Never call this for a plain explain (ამიხსნა მოკლედ).",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Course or semester name, if known." } },
    },
    card: true,
  },
  {
    name: "advance_path",
    description:
      "Only when the student looks ready: they said გაიარე / next topic, passed a practice/exam check, or tapped Continue on a node already marked ready. Never on a greeting, thanks, or because YOU just explained. Do not dump the rest of the path. Card stays the same path.",
    parameters: { type: "object", properties: {} },
    card: true,
  },
  {
    name: "restart_path",
    description:
      "A study path already exists and the user wants to start from the first topic (პირველიდან / თავიდან / start from the beginning), or current was jumped into the middle. Only before teaching has started. Reset current to the first open node. One short line plus the same path card. Do not create a new path. Do not write [artifact ...] in chat.",
    parameters: { type: "object", properties: {} },
    card: true,
  },
  {
    name: "start_path",
    description:
      "The student confirmed the draft path (დავიწყოთ / let's start / Continue). Opens a child thread for this plan; the parent chat stays free. Never call this until they confirmed. Do not change the map. One short line plus the same path card. Do not teach the first topic in the parent chat.",
    parameters: { type: "object", properties: {} },
    card: true,
  },
  {
    name: "search_images",
    description:
      "Find photos, charts, graphs, maps, or diagrams. Call only if the user asked for a figure/photo/diagram, or this turn is about an attached slide/image. Do not call because a figure might help. Always write one short line in the user's language in the same turn; the photos render under it. Skip abstract-only answers and skip when project files already have the figure. Pass the full topic as query in the original language. Optional count (max 8). If they only asked for photos with no topic, use clarify once instead. If search returns nothing, say so in one short line. Never invent image URLs. Do not dump URL lists in chat.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Image search query." },
        count: { type: "integer", description: "Upper bound, max 8. Omit to let search keep only the closest matches." },
      },
      required: ["query"],
    },
  },
];

export function isChatToolName(value: unknown): value is ChatToolName {
  return typeof value === "string" && (CHAT_TOOLS as readonly string[]).includes(value);
}

export function toolStreamsText(name: ChatToolName): boolean {
  return !isArtifactTool(name);
}

export function isArtifactTool(name: ChatToolName): boolean {
  return CHAT_TOOL_DEFINITIONS.some((def) => def.name === name && def.card);
}

export function parseClarifyOptions(value: unknown): string[] | undefined {
  let raw: unknown[] = [];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) raw = [];
    else if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        raw = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        raw = trimmed.split(/[,|;]/);
      }
    } else raw = trimmed.split(/[,|;]/);
  } else if (value && typeof value === "object") raw = Object.values(value);

  const items = raw
    .map((item) => (typeof item === "string" ? item : item != null ? String(item) : ""))
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const lower = item.toLowerCase();
      return lower !== "სხვა" && lower !== "other";
    });
  const unique = [...new Set(items)].slice(0, 4);
  return unique.length ? unique : undefined;
}

export function parseToolArgs(value: unknown): ChatToolArgs {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const count = typeof row.count === "number" ? row.count : typeof row.count === "string" ? Number(row.count) : NaN;
  return {
    topic: typeof row.topic === "string" ? row.topic.trim() || undefined : undefined,
    question: typeof row.question === "string" ? row.question.trim() || undefined : undefined,
    options: parseClarifyOptions(row.options),
    instruction: typeof row.instruction === "string" ? row.instruction.trim() || undefined : undefined,
    id: typeof row.id === "string" ? row.id.trim() || undefined : undefined,
    query: typeof row.query === "string" ? row.query.trim() || undefined : undefined,
    count: Number.isFinite(count) ? Math.min(8, Math.max(1, Math.floor(count))) : undefined,
    mode: row.mode === "exam" || row.mode === "practice" ? row.mode : undefined,
  };
}

export function parseToolCall(name: unknown, args?: unknown): ChatToolCall | null {
  if (!isChatToolName(name)) return null;
  return { name, args: parseToolArgs(args) };
}

/** OpenAI Chat Completions tool list. Unused until that provider is wired. */
export function toOpenAITools(defs: ChatToolDefinition[] = CHAT_TOOL_DEFINITIONS) {
  return defs.map((def) => ({
    type: "function" as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    },
  }));
}

/** Anthropic Messages tool list. Unused until that provider is wired. */
export function toAnthropicTools(defs: ChatToolDefinition[] = CHAT_TOOL_DEFINITIONS) {
  return defs.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: def.parameters,
  }));
}
