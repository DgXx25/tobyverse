export const CHAT_TOOLS = [
  "answer",
  "clarify",
  "suggest_practice",
  "suggest_sheet",
  "create_practice",
  "edit_practice",
  "append_practice",
  "create_sheet",
  "edit_sheet",
  "search_images",
] as const;

export type ChatToolName = (typeof CHAT_TOOLS)[number];

export type ChatToolArgs = {
  topic?: string;
  question?: string;
  options?: string[];
  instruction?: string;
  count?: number;
  id?: string;
  query?: string;
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
      "Default. A topic name or ordinary question: write the explanation in the user's language. Never reply by asking what the topic is. No chips. Do not create a set or notes.",
    parameters: { type: "object", properties: {} },
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
    description: "After a full explanation only. Offer a practice chip. Do not create the set.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Topic for the chip." } },
    },
  },
  {
    name: "suggest_sheet",
    description:
      "Optional notes chip after the user asked a question and you already answered. If they asked for a note (კონსპექტი / დამიკონსპექტე), call create_sheet instead. Never write the notes as chat text.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Topic for the chip." } },
    },
  },
  {
    name: "create_practice",
    description:
      "User asked to practice (or accepted a suggestion, or said to just generate after a clarify). Never write quiz items into chat — card only.",
    parameters: {
      type: "object",
      properties: { topic: { type: "string", description: "Practice topic, including the latest user topic." } },
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
      "User asked for notes (კონსპექტი / დამიკონსპექტე), or answered a notes clarify. Always call this instead of writing the notes in chat. The generator builds visual blocks. One short chat line plus the card.",
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
      "Rewrite the current notes as a conspectus of visual blocks (section, formula_card, diagram, compare_vs only for mix-ups). Keep the same id. Never dump the notes into chat.",
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
    name: "search_images",
    description:
      "User asked to find or show photos, images, charts, graphs, or diagrams — in any language. Pass their topic as query in the original language. Optional count of photos (default 6). Never create a practice set or notes. If they only said they want photos with no topic, use clarify once instead. If search returns nothing, say so in one short line. Never invent image URLs. Do not dump URL lists in chat.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Image search query." },
        count: { type: "integer", description: "How many photos to return (default 6)." },
      },
      required: ["query"],
    },
  },
];

export function isChatToolName(value: unknown): value is ChatToolName {
  return typeof value === "string" && (CHAT_TOOLS as readonly string[]).includes(value);
}

export function toolStreamsText(name: ChatToolName): boolean {
  if (name === "search_images") return false;
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
    count: Number.isFinite(count) ? Math.min(10, Math.max(1, Math.floor(count))) : undefined,
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
